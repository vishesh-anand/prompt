import { assertEquals } from 'jsr:@std/assert@1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { measure } from '../_shared/pipeline/measure.ts';
import type { Model, PromptFile } from '../_shared/providers/model.ts';
import type { Transcript } from '../_shared/schemas/metrics.ts';
import { type AnswerRow, runPipeline } from './runPipeline.ts';

const spoken = 'So I like cats. Cats are calm and quiet. I think they are great pets, honestly.'.split(' ');
const transcript: Transcript = { words: spoken.map((punctuated, i) => ({ text: punctuated.toLowerCase().replace(/[^a-z]/g, ''), punctuated, start: i * 0.5, end: i * 0.5 + 0.4 })) };

const judgement = {
  mainPoint: { score: 2, quotes: ['I like cats.'], why: 'w' },
  reasonOrExample: { score: 1, quotes: ['Cats are calm and quiet.'], why: 'w' },
  ending: { score: 1, quotes: ['I think they are great pets, honestly.'], why: 'w' },
};
const coaching = { tip: 'Back your point up. Next time, name one real cat.', betterVersion: 'I like cats. They are calm and quiet.' };

const row = (changes: Partial<AnswerRow> = {}): AnswerRow => ({
  id: 'answer-1', user_id: 'user-1', question_id: 7, audio_path: 'user-1/answer-1.m4a', duration_ms: 30_000,
  transcript: null, metrics: null, judgement: null, coaching: null, ...changes,
});

// A stand-in for the database: records every change to the answer and the notebook.
function fakeAdmin() {
  const answerChanges: Record<string, unknown>[] = [];
  const notebooks = new Map<string, string>([['user-1', 'Says like often.']]);
  const ok = Promise.resolve({ error: null });
  const admin = {
    from(table: string) {
      if (table === 'answers') return { update: (changes: Record<string, unknown>) => ({ eq: () => (answerChanges.push(changes), ok) }) };
      if (table === 'questions') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { text: 'What do you like?' }, error: null }) }) }) };
      return {
        select: () => ({ eq: (_: string, id: string) => ({ maybeSingle: () => Promise.resolve({ data: notebooks.has(id) ? { notes: notebooks.get(id) } : null, error: null }) }) }),
        upsert: (r: { user_id: string; notes: string }) => (notebooks.set(r.user_id, r.notes), ok),
      };
    },
    storage: { from: () => ({ download: () => Promise.resolve({ data: new Blob([new Uint8Array(3)]), error: null }) }) },
  } as unknown as SupabaseClient;
  const statuses = () => answerChanges.flatMap((c) => (typeof c.status === 'string' ? [c.status] : []));
  return { admin, answerChanges, notebooks, statuses };
}

// Providers whose model answers by prompt name, and which remember what was called.
function fakeProviders(fail: string[] = []) {
  const calls: string[] = [];
  let transcribed = 0;
  const providers = {
    transcriber: { transcribe: () => (transcribed++, Promise.resolve(transcript)) },
    transcriberVersion: 'fake/1',
    modelName: 'fake-model',
    makeModel: (onUsage: (u: { model: string; inputTokens: number; outputTokens: number }) => void): Model => ({
      generate<T>({ prompt }: { prompt: PromptFile }) {
        calls.push(prompt.name);
        onUsage({ model: 'fake-model', inputTokens: 100, outputTokens: 50 });
        if (fail.includes(prompt.name)) return Promise.reject(new Error(`${prompt.name} is down`));
        const reply = prompt.name === 'judge' ? judgement : prompt.name === 'coach' ? coaching : { notes: 'Says like less. Keep going.' };
        return Promise.resolve(reply as T);
      },
    }),
  };
  return { providers, calls, transcribed: () => transcribed };
}

Deno.test('runs every stage in order, saving each one before the next', async () => {
  const { admin, statuses, notebooks, answerChanges } = fakeAdmin();
  const { providers, calls } = fakeProviders();
  await runPipeline(admin, row(), providers);
  assertEquals(statuses(), ['transcribed', 'measured', 'judged', 'coached']);
  assertEquals(calls, ['judge', 'coach', 'notebook']);
  assertEquals(notebooks.get('user-1'), 'Says like less. Keep going.');
  // The last save carries the cost of every AI stage.
  const version = answerChanges[answerChanges.length - 1].pipeline_version as { usage: Record<string, unknown>; model: string };
  assertEquals(Object.keys(version.usage), ['judge', 'coach', 'notebook']);
  assertEquals(version.usage.coach, { inputTokens: 100, outputTokens: 50 });
  assertEquals(version.model, 'fake-model');
});

Deno.test('a restart picks up after the last saved stage', async () => {
  const { admin, statuses } = fakeAdmin();
  const { providers, calls, transcribed } = fakeProviders();
  await runPipeline(admin, row({ transcript, metrics: measure({ transcript }), judgement: { ...judgement, mainPointAtSeconds: 0.5 } }), providers);
  assertEquals(transcribed(), 0);
  assertEquals(calls, ['coach', 'notebook']);
  assertEquals(statuses(), ['coached']);
});

Deno.test('an answer that is already fully done does nothing more', async () => {
  const { admin, answerChanges } = fakeAdmin();
  const { providers, calls } = fakeProviders();
  await runPipeline(admin, row({ transcript, metrics: measure({ transcript }), judgement: { ...judgement, mainPointAtSeconds: 0.5 }, coaching }), providers);
  assertEquals(calls, []);
  assertEquals(answerChanges, []);
});

Deno.test('nothing said means no judge, coach or notebook', async () => {
  const { admin, statuses } = fakeAdmin();
  const { providers, calls } = fakeProviders();
  await runPipeline(admin, row({ transcript: { words: [] } }), providers);
  assertEquals(calls, []);
  assertEquals(statuses(), ['measured']);
});

Deno.test('a coach that fails twice marks the answer failed but keeps the judgement', async () => {
  const { admin, statuses, answerChanges } = fakeAdmin();
  const { providers, calls } = fakeProviders(['coach']);
  await runPipeline(admin, row(), providers);
  assertEquals(statuses(), ['transcribed', 'measured', 'judged', 'failed']);
  assertEquals(calls, ['judge', 'coach', 'coach']);
  assertEquals(answerChanges.some((c) => 'judgement' in c), true);
});

Deno.test('a notebook that fails leaves the answer coached', async () => {
  const { admin, statuses, notebooks } = fakeAdmin();
  const { providers } = fakeProviders(['notebook']);
  await runPipeline(admin, row(), providers);
  assertEquals(statuses(), ['transcribed', 'measured', 'judged', 'coached']);
  assertEquals(notebooks.get('user-1'), 'Says like often.');
});
