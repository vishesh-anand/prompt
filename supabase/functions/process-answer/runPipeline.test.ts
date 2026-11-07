import { assertEquals } from 'jsr:@std/assert@1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { placeLabels } from '../_shared/pipeline/map.ts';
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
// What the model replies, and what is saved from it.
const mapReply = {
  point: { restatement: 'You like cats.', quote: 'I like cats' },
  sentences: [
    { sentence: 1, label: 'point' },
    { sentence: 2, label: 'support' },
    { sentence: 3, label: 'ending' },
  ],
  didntFollow: [],
  restarts: [],
  noticed: [],
  effort: 1,
};
const coachReply = {
  tip: 'Back your point up. Next time, name one real cat.',
  betterSentences: [
    { text: 'I like cats.', label: 'point' },
    { text: 'They are calm and quiet.', label: 'support' },
  ],
  whatChanged: 'The opening "So" is gone.',
};
const coaching = { tip: coachReply.tip, betterVersion: 'I like cats. They are calm and quiet.' };

// The times answers were created, as the database writes them.
const noon = '2026-10-07T12:00:00.000000+00:00';
const earlier = '2026-10-06T09:00:00.000000+00:00';
const later = '2026-10-07T18:00:00.000000+00:00';

const row = (changes: Partial<AnswerRow> = {}): AnswerRow => ({
  id: 'answer-1', user_id: 'user-1', question_id: 7, audio_path: 'user-1/answer-1.m4a', duration_ms: 30_000, time_limit_ms: 120_000, created_at: noon,
  transcript: null, metrics: null, map: null, judgement: null, coaching: null, ...changes,
});

type NotebookRow = { notes: string; last_answer_at: string | null };

// A stand-in for the database: records every change to the answer, and keeps the notebook table in memory with the
// same rules as the real one (one row per person, so a second insert is a "duplicate" error).
function fakeAdmin(startingNotebook: NotebookRow | null = { notes: 'Says like often.', last_answer_at: null }) {
  const answerChanges: Record<string, unknown>[] = [];
  const questionReads: string[] = [];
  const notebooks = new Map<string, NotebookRow>();
  if (startingNotebook) notebooks.set('user-1', { ...startingNotebook });
  const ok = Promise.resolve({ error: null });

  const notebookTable = {
    select: () => ({ eq: (_: string, id: string) => ({ maybeSingle: () => Promise.resolve({ data: notebooks.get(id) ?? null, error: null }) }) }),
    insert: (r: { user_id: string; notes: string; last_answer_at: string }) => {
      if (notebooks.has(r.user_id)) return Promise.resolve({ error: { code: '23505' } });
      notebooks.set(r.user_id, { notes: r.notes, last_answer_at: r.last_answer_at });
      return ok;
    },
    update: (changes: { notes: string; last_answer_at: string }) => {
      const conditions: ((n: NotebookRow) => boolean)[] = [];
      let userId = '';
      const chain = {
        eq: (column: string, value: string) => {
          if (column === 'user_id') userId = value;
          else conditions.push((n) => n.last_answer_at === value);
          return chain;
        },
        is: () => (conditions.push((n) => n.last_answer_at === null), chain),
        select: () => {
          const current = notebooks.get(userId);
          if (!current || !conditions.every((c) => c(current))) return Promise.resolve({ data: [], error: null });
          notebooks.set(userId, { notes: changes.notes, last_answer_at: changes.last_answer_at });
          return Promise.resolve({ data: [{ user_id: userId }], error: null });
        },
      };
      return chain;
    },
    // The old way of saving, kept so a regression to it shows up as a failing test and not as a crash.
    upsert: (r: { user_id: string; notes: string }) => (notebooks.set(r.user_id, { notes: r.notes, last_answer_at: null }), ok),
  };

  const admin = {
    from(table: string) {
      if (table === 'answers') return { update: (changes: Record<string, unknown>) => ({ eq: () => (answerChanges.push(changes), ok) }) };
      if (table === 'questions') {
        return {
          select: (columns: string) => (questionReads.push(columns), { eq: () => ({ single: () => Promise.resolve({ data: { text: 'What do you like?', wants_direct_answer: true }, error: null }) }) }),
        };
      }
      return notebookTable;
    },
    storage: { from: () => ({ download: () => Promise.resolve({ data: new Blob([new Uint8Array(3)]), error: null }) }) },
  } as unknown as SupabaseClient;
  const statuses = () => answerChanges.flatMap((c) => (typeof c.status === 'string' ? [c.status] : []));
  return { admin, answerChanges, notebooks, statuses, questionReads };
}

// Providers whose model answers by prompt name, and which remember what was called. The notebook reply is the
// old notes plus a tag, so a test can see exactly which answers were folded in, and in what order.
function fakeProviders({ fail = [] as string[], tag = 'x', beforeNotebookReply = () => Promise.resolve() } = {}) {
  const calls: string[] = [];
  const seenInputs: Record<string, unknown> = {};
  let transcribed = 0;
  const providers = {
    transcriber: { transcribe: () => (transcribed++, Promise.resolve(transcript)) },
    transcriberVersion: 'fake/1',
    modelName: 'fake-model',
    makeModel: (onUsage: (u: { model: string; inputTokens: number; outputTokens: number }) => void): Model => ({
      async generate<T>({ prompt, input }: { prompt: PromptFile; input: unknown }) {
        calls.push(prompt.name);
        onUsage({ model: 'fake-model', inputTokens: 100, outputTokens: 50 });
        if (fail.includes(prompt.name)) throw new Error(`${prompt.name} is down`);
        if (prompt.name === 'notebook') {
          await beforeNotebookReply();
          return { notes: `${(input as { notes: string }).notes}|${tag}` } as T;
        }
        seenInputs[prompt.name] = input;
        return (prompt.name === 'judge' ? judgement : prompt.name === 'map' ? mapReply : coachReply) as T;
      },
    }),
  };
  return { providers, calls, seenInputs, transcribed: () => transcribed };
}

const savedMap = { ...mapReply, version: 7, ...placeLabels(['point', 'support', 'ending'], transcript) };

const savedAnswer = (changes: Partial<AnswerRow> = {}) =>
  row({ transcript, metrics: measure({ transcript }), map: savedMap, judgement: { ...judgement, mainPointAtSeconds: 0.5 }, ...changes });

Deno.test('runs every stage in order, saving each one before the next', async () => {
  const { admin, statuses, notebooks, answerChanges } = fakeAdmin();
  const { providers, calls } = fakeProviders({ tag: 'one' });
  await runPipeline(admin, row(), providers);
  assertEquals(statuses(), ['transcribed', 'measured', 'mapped', 'judged', 'coached']);
  assertEquals(calls, ['map', 'judge', 'coach', 'notebook']);
  assertEquals(notebooks.get('user-1')?.notes, 'Says like often.|one');
  // The last save carries the cost of every AI stage.
  const version = answerChanges[answerChanges.length - 1].pipeline_version as { usage: Record<string, unknown>; model: string };
  assertEquals(Object.keys(version.usage), ['map', 'judge', 'coach', 'notebook']);
  assertEquals(version.usage.coach, { inputTokens: 100, outputTokens: 50 });
  assertEquals(version.model, 'fake-model');
});

Deno.test('what is saved: the map with its times, and the coaching with its steps and what changed', async () => {
  const { admin, answerChanges, questionReads } = fakeAdmin();
  await runPipeline(admin, row(), fakeProviders().providers);
  const saved = Object.assign({}, ...answerChanges) as Record<string, unknown>;
  // Each step also carries its opening words, so the screen can quote it (placeMoments).
  const openings = ['So I like cats.', 'Cats are calm and quiet.', 'I think they are great pets, honestly.'];
  assertEquals((saved.map as { steps: unknown }).steps, savedMap.steps.map((s, i) => ({ ...s, opening: openings[i] })));
  assertEquals((saved.map as { firstWordAtSeconds: number }).firstWordAtSeconds, transcript.words[0].start);
  assertEquals((saved.map as { version: number }).version, 8);
  assertEquals(saved.coaching, {
    tip: coachReply.tip,
    betterVersion: 'I like cats. They are calm and quiet.',
    betterSteps: [
      { label: 'point', text: 'I like cats.' },
      { label: 'support', text: 'They are calm and quiet.' },
    ],
    whatChanged: 'The opening "So" is gone.',
  });
  assertEquals((saved.pipeline_version as { map: number }).map, 8);
  // The question is read once, with its direct-answer flag.
  assertEquals(questionReads, ['text, wants_direct_answer']);
});

Deno.test('the coach is told whether the question wanted a direct answer, and gets the map', async () => {
  const { admin } = fakeAdmin();
  const { providers, seenInputs } = fakeProviders();
  await runPipeline(admin, row(), providers);
  const sent = seenInputs.coach as { questionWantsDirectAnswer: boolean; map: { listenerHeard: string }; focus: { kind: string } };
  assertEquals(sent.questionWantsDirectAnswer, true);
  assertEquals(sent.map.listenerHeard, 'You like cats.');
  // Point first, a reason, an ending, nothing noticed, a good pace: nothing to fix.
  assertEquals(sent.focus.kind, 'polish');
});

Deno.test('a saved map is used as it is, never made again', async () => {
  const { admin, statuses, answerChanges } = fakeAdmin();
  const { providers, calls, seenInputs } = fakeProviders();
  await runPipeline(admin, row({ transcript, metrics: measure({ transcript }), map: savedMap }), providers);
  assertEquals(calls, ['judge', 'coach', 'notebook']);
  assertEquals(statuses(), ['judged', 'coached']);
  assertEquals(answerChanges.some((c) => 'map' in c), false);
  assertEquals((seenInputs.coach as { map: { steps: unknown } }).map.steps, savedMap.steps);
});

Deno.test('a map that fails twice marks the answer failed, before the judge or coach, and keeps what was saved', async () => {
  const { admin, statuses, answerChanges } = fakeAdmin();
  const { providers, calls } = fakeProviders({ fail: ['map'] });
  await runPipeline(admin, row(), providers);
  assertEquals(statuses(), ['transcribed', 'measured', 'failed']);
  assertEquals(calls, ['map', 'map']);
  assertEquals(answerChanges.some((c) => 'metrics' in c), true);
  // The recording is never touched: only the answer row changes.
  assertEquals(answerChanges.every((c) => !('audio_path' in c)), true);
});

Deno.test('a restart picks up after the last saved stage', async () => {
  const { admin, statuses } = fakeAdmin();
  const { providers, calls, transcribed } = fakeProviders();
  await runPipeline(admin, savedAnswer(), providers);
  assertEquals(transcribed(), 0);
  assertEquals(calls, ['coach', 'notebook']);
  assertEquals(statuses(), ['coached']);
});

Deno.test('an answer that is already fully done does nothing more', async () => {
  const { admin, answerChanges } = fakeAdmin();
  const { providers, calls } = fakeProviders();
  await runPipeline(admin, savedAnswer({ coaching }), providers);
  assertEquals(calls, []);
  assertEquals(answerChanges, []);
});

Deno.test('nothing said means no map, judge, coach or notebook', async () => {
  const { admin, statuses } = fakeAdmin();
  const { providers, calls } = fakeProviders();
  await runPipeline(admin, row({ transcript: { words: [] } }), providers);
  assertEquals(calls, []);
  assertEquals(statuses(), ['measured']);
});

Deno.test('a coach that fails twice marks the answer failed but keeps the judgement', async () => {
  const { admin, statuses, answerChanges } = fakeAdmin();
  const { providers, calls } = fakeProviders({ fail: ['coach'] });
  await runPipeline(admin, row(), providers);
  assertEquals(statuses(), ['transcribed', 'measured', 'mapped', 'judged', 'failed']);
  assertEquals(calls, ['map', 'judge', 'coach', 'coach']);
  assertEquals(answerChanges.some((c) => 'judgement' in c), true);
});

Deno.test('a notebook that fails leaves the answer coached', async () => {
  const { admin, statuses, notebooks } = fakeAdmin();
  const { providers } = fakeProviders({ fail: ['notebook'] });
  await runPipeline(admin, row(), providers);
  assertEquals(statuses(), ['transcribed', 'measured', 'mapped', 'judged', 'coached']);
  assertEquals(notebooks.get('user-1')?.notes, 'Says like often.');
});

// ---- the notebook only moves forward, in the order answers were given ----

Deno.test('a newer answer updates the notebook and records which answer it has absorbed', async () => {
  const { admin, notebooks } = fakeAdmin({ notes: 'old', last_answer_at: earlier });
  await runPipeline(admin, savedAnswer({ created_at: later }), fakeProviders({ tag: 'new' }).providers);
  assertEquals(notebooks.get('user-1'), { notes: 'old|new', last_answer_at: later });
});

Deno.test('an older answer never updates a notebook that has already moved past it', async () => {
  const { admin, notebooks, statuses } = fakeAdmin({ notes: 'newer notes', last_answer_at: later });
  const { providers, calls } = fakeProviders({ tag: 'old' });
  await runPipeline(admin, savedAnswer({ created_at: earlier }), providers);
  assertEquals(notebooks.get('user-1'), { notes: 'newer notes', last_answer_at: later });
  // The answer's own feedback is still saved, and the model is not asked to rewrite a notebook it won't be allowed to change.
  assertEquals(statuses(), ['coached']);
  assertEquals(calls, ['coach']);
});

Deno.test('the same answer run twice only updates the notebook once', async () => {
  const { admin, notebooks } = fakeAdmin({ notes: 'start', last_answer_at: null });
  await runPipeline(admin, savedAnswer(), fakeProviders({ tag: 'a' }).providers);
  await runPipeline(admin, savedAnswer(), fakeProviders({ tag: 'a' }).providers);
  assertEquals(notebooks.get('user-1')?.notes, 'start|a');
});

// Two answers processed at the same moment: both read the notebook before either writes.
async function race(firstToFinish: 'older' | 'newer') {
  const { admin, notebooks } = fakeAdmin(null);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  let reads = 0;
  const wait = (who: 'older' | 'newer') => async () => {
    reads++;
    if (reads === 2) release();
    await gate;
    // The one that should finish second waits a moment longer.
    if (who !== firstToFinish) await new Promise((r) => setTimeout(r, 20));
  };
  const older = fakeProviders({ tag: 'older', beforeNotebookReply: wait('older') }).providers;
  const newer = fakeProviders({ tag: 'newer', beforeNotebookReply: wait('newer') }).providers;
  await Promise.all([
    runPipeline(admin, savedAnswer({ id: 'a-old', created_at: earlier }), older),
    runPipeline(admin, savedAnswer({ id: 'a-new', created_at: later }), newer),
  ]);
  return notebooks.get('user-1');
}

Deno.test('two answers at once, older finishing first: the notebook takes the older, then the newer', async () => {
  assertEquals(await race('older'), { notes: '|older|newer', last_answer_at: later });
});

Deno.test('two answers at once, newer finishing first: the older one cannot overwrite it', async () => {
  assertEquals(await race('newer'), { notes: '|newer', last_answer_at: later });
});
