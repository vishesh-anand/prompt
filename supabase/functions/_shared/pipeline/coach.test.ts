import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import type { Model, PromptFile } from '../providers/model.ts';
import type { Coaching } from '../schemas/coaching.ts';
import type { SavedJudgement } from '../schemas/judgement.ts';
import type { Metrics, Transcript } from '../schemas/metrics.ts';
import { coach, coachProblems, tipMaxChars } from './coach.ts';
import { updateNotebook, notebookMaxChars } from './notebook.ts';

const words = ['I', 'like', 'cats.', 'Cats', 'are', 'calm', 'and', 'quiet.'];
const transcript: Transcript = { words: words.map((punctuated, i) => ({ text: punctuated.toLowerCase().replace(/[^a-z]/g, ''), punctuated, start: i, end: i + 0.5 })) };

const mark = { score: 2 as const, quotes: ['I like cats.'], why: 'w' };
const judgement: SavedJudgement = { mainPoint: mark, reasonOrExample: mark, ending: mark, mainPointAtSeconds: 0 };
const metrics: Metrics = {
  wordCount: 8,
  fillers: { total: 0, byWord: {} },
  pace: { wordsPerMinute: 140, band: 'good' },
  pauses: { count: 0, longestMs: 0, atSeconds: [] },
  restarts: { count: 0, atSeconds: [] },
};
const input = { question: 'What do you like?', transcript, focus: { kind: 'polish' as const, facts: {} }, notebook: '', stoppedByTimeLimit: false };

const good: Coaching = { tip: 'Open with the point. Next time, say it first.', betterVersion: 'I like cats. They are calm.' };

// A model that replies with each reply in turn, and remembers what it was asked.
function modelThatSays(...replies: unknown[]) {
  const seen: { prompt: PromptFile; input: unknown }[] = [];
  const model: Model = {
    generate<T>(args: { prompt: PromptFile; input: unknown }) {
      seen.push({ prompt: args.prompt, input: args.input });
      return Promise.resolve(replies[Math.min(seen.length - 1, replies.length - 1)] as T);
    },
  };
  return { model, seen };
}

Deno.test('coach passes the question, the answer as text, the focus and the notebook to the model', async () => {
  const { model, seen } = modelThatSays(good);
  assertEquals(await coach({ ...input, notebook: 'Says like a lot.' }, model), good);
  const sent = seen[0].input as Record<string, unknown>;
  assertEquals(seen[0].prompt.name, 'coach');
  assertEquals(sent.question, 'What do you like?');
  assertEquals(sent.transcript, 'I like cats. Cats are calm and quiet.');
  assertEquals(sent.focus, { kind: 'polish', facts: {} });
  assertEquals(sent.notebook, 'Says like a lot.');
  // Only what the tip needs: not every measurement and mark.
  assertEquals(Object.keys(sent).sort(), ['focus', 'notebook', 'question', 'stoppedByTimeLimit', 'transcript']);
});

Deno.test('problems: an empty tip, a long tip, shouting, and a rewrite that grew', () => {
  assertEquals(coachProblems(good, transcript), []);
  assertEquals(coachProblems({ ...good, tip: '  ' }, transcript).length, 1);
  assertEquals(coachProblems({ ...good, tip: 'x'.repeat(tipMaxChars + 1) }, transcript).length, 1);
  assertEquals(coachProblems({ ...good, tip: 'Pause! Then go! Again!' }, transcript).length, 1);
  assertEquals(coachProblems({ ...good, tip: 'Stop!' }, transcript), []);
  assertEquals(coachProblems({ ...good, betterVersion: 'one two three four five six seven eight nine' }, transcript).length, 1);
  assertEquals(coachProblems({ ...good, betterVersion: '' }, transcript).length, 1);
});

Deno.test('a rejected reply is asked for again once, then accepted', async () => {
  const { model, seen } = modelThatSays({ ...good, betterVersion: 'one two three four five six seven eight nine' }, good);
  const failures: string[] = [];
  assertEquals(await coach(input, model, { onAttemptFailed: (e) => failures.push(e.message) }), good);
  assertEquals(seen.length, 2);
  assertEquals(failures.length, 1);
});

Deno.test('two rejected replies fail the stage', async () => {
  const { model } = modelThatSays({ ...good, tip: '' });
  await assertRejects(() => coach(input, model), Error, 'rejected');
});

Deno.test('notebook returns the trimmed notes and passes the old ones', async () => {
  const { model, seen } = modelThatSays({ notes: '  Says like often.  ' });
  const notes = await updateNotebook({ previousNotes: 'old', judgement, metrics, tip: 'tip' }, model);
  assertEquals(notes, 'Says like often.');
  assertEquals((seen[0].input as { notes: string }).notes, 'old');
  assertEquals(seen[0].prompt.name, 'notebook');
});

Deno.test('notebook that is too long is asked for again, then rejected', async () => {
  const long = { notes: 'x'.repeat(notebookMaxChars + 1) };
  const { model, seen } = modelThatSays(long);
  await assertRejects(() => updateNotebook({ previousNotes: '', judgement, metrics, tip: 'tip' }, model), Error, 'more than');
  assertEquals(seen.length, 2);
});
