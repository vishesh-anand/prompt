import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@0.131.0/helpers/zod';

import type { Model, PromptFile } from '../providers/model.ts';
import { type CoachingOutput, coachingOutputSchema, coachingSchema, maxReasonWords, maxTipWords, maxWhatChangedWords } from '../schemas/coaching.ts';
import type { SavedMap } from '../schemas/map.ts';
import type { Metrics, Transcript } from '../schemas/metrics.ts';
import { testMetrics } from '../testMetrics.ts';
import { coach, coachProblems } from './coach.ts';
import { placeLabels } from './map.ts';
import { updateNotebook, notebookMaxChars } from './notebook.ts';
import { problemOf } from './twice.ts';

const words = ['I', 'like', 'cats.', 'Cats', 'are', 'calm', 'and', 'quiet.'];
const transcript: Transcript = { words: words.map((punctuated, i) => ({ text: punctuated.toLowerCase().replace(/[^a-z]/g, ''), punctuated, start: i, end: i + 0.5 })) };

const map: SavedMap = {
  point: { restatement: 'You like cats.', quote: 'I like cats' },
  sentences: [
    { sentence: 1, label: 'point' },
    { sentence: 2, label: 'support' },
  ],
  didntFollow: [],
  restarts: [],
  noticed: [],
  effort: 1,
  version: 8,
  ...placeLabels(['point', 'support'], transcript),
};
const metrics: Metrics = testMetrics({ wordCount: 8 });
const input = {
  question: 'What do you like?',
  wantsDirectAnswer: true,
  transcript,
  map,
  focus: { kind: 'polish' as const, facts: {} },
  notebook: '',
  stoppedByTimeLimit: false,
};

const good: CoachingOutput = {
  tip: 'Say your point in your first sentence.',
  reason: 'Your point came first, and the reason after it was thin.',
  betterSentences: [
    { text: 'I like cats.', label: 'point' },
    { text: 'They are calm.', label: 'support' },
    { text: 'And quiet.', label: 'support' },
  ],
  whatChanged: 'The second sentence is tighter.',
};
const withOutput = (changes: Partial<CoachingOutput>): CoachingOutput => ({ ...good, ...changes });
const nineWords = [{ text: 'one two three four five six seven eight nine', label: 'point' as const }];

// A model that replies with each reply in turn, and remembers what it was asked.
function modelThatSays(...replies: unknown[]) {
  const seen: { prompt: PromptFile; input: unknown; schema: { safeParse(v: unknown): { success: boolean } } }[] = [];
  const model: Model = {
    generate<T>(args: { prompt: PromptFile; input: unknown; schema: { safeParse(v: unknown): { success: boolean } } }) {
      seen.push({ prompt: args.prompt, input: args.input, schema: args.schema });
      return Promise.resolve(replies[Math.min(seen.length - 1, replies.length - 1)] as T);
    },
  };
  return { model, seen };
}

Deno.test('coach passes the question, the numbered answer, the map, the focus and the notebook to the model', async () => {
  const { model, seen } = modelThatSays(good);
  await coach({ ...input, notebook: 'Says like a lot.' }, model);
  const sent = seen[0].input as Record<string, unknown>;
  assertEquals(seen[0].prompt.name, 'coach');
  assertEquals(sent.question, 'What do you like?');
  assertEquals(sent.questionWantsDirectAnswer, true);
  assertEquals(sent.transcript, '1. I like cats.\n2. Cats are calm and quiet.');
  assertEquals(sent.map, { steps: map.steps, listenerHeard: 'You like cats.', didntFollow: [], noticed: [] });
  assertEquals(sent.focus, { kind: 'polish', facts: {} });
  assertEquals(sent.notebook, 'Says like a lot.');
  // Only what the tip needs: not every measurement, and not the map's effort or restarts.
  assertEquals(Object.keys(sent).sort(), ['focus', 'map', 'notebook', 'question', 'questionWantsDirectAnswer', 'stoppedByTimeLimit', 'transcript']);
});

Deno.test('what is saved: the sentences joined, the steps labelled like a map, and what changed', async () => {
  const { model } = modelThatSays(withOutput({ tip: '  Open with it.  ', reason: ' It came late. ', whatChanged: ' The second sentence is tighter. ' }));
  assertEquals(await coach(input, model), {
    tip: 'Open with it.',
    reason: 'It came late.',
    betterVersion: 'I like cats. They are calm. And quiet.',
    betterSteps: [
      { label: 'point', text: 'I like cats.' },
      { label: 'support', text: 'They are calm. And quiet.' },
    ],
    whatChanged: 'The second sentence is tighter.',
  });
});

Deno.test('the moment plain code picked for the tip is saved with it, and never sent to the model', async () => {
  const { model, seen } = modelThatSays(good);
  const moment = { quote: 'Cats are calm and quiet.', atSeconds: 3 };
  const saved = await coach({ ...input, focus: { kind: 'support', facts: { pointQuote: 'I like cats' }, moment } }, model);
  assertEquals(saved.moment, moment);
  assertEquals((seen[0].input as Record<string, unknown>).focus, { kind: 'support', facts: { pointQuote: 'I like cats' } });
});

Deno.test('problems: an empty tip, shouting, a rewrite that grew, pause marks and empty sentences', () => {
  assertEquals(coachProblems(good, transcript, map), []);
  assertEquals(coachProblems(withOutput({ tip: '  ' }), transcript, map).length, 1);
  assertEquals(coachProblems(withOutput({ tip: 'Pause! Then go! Again!' }), transcript, map).length, 1);
  assertEquals(coachProblems(withOutput({ tip: 'Stop!' }), transcript, map), []);
  // The tip and the reason share one card: one exclamation mark between them at most, and the reason can't be empty.
  assertEquals(coachProblems(withOutput({ tip: 'Stop!', reason: 'It ran on!' }), transcript, map).length, 1);
  assertEquals(coachProblems(withOutput({ reason: ' ' }), transcript, map), ['the reason is empty']);
  assertEquals(coachProblems(withOutput({ betterSentences: nineWords }), transcript, map).length, 1);
  assertEquals(coachProblems(withOutput({ betterSentences: [{ text: 'I like [2.0 s pause] cats.', label: 'point' }] }), transcript, map).length, 1);
  assertEquals(coachProblems(withOutput({ betterSentences: [{ text: '1. I like cats.', label: 'point' }] }), transcript, map).length, 1);
  assertEquals(coachProblems(withOutput({ betterSentences: [{ text: 'I like cats.', label: 'point' }, { text: ' ', label: 'support' }] }), transcript, map).length, 1);
});

Deno.test('problems: the better version keeps exactly one point step when the answer has one', () => {
  const twoPoints = withOutput({ betterSentences: [{ text: 'Cats.', label: 'point' }, { text: 'Calm.', label: 'support' }, { text: 'Quiet.', label: 'point' }] });
  assertEquals(coachProblems(twoPoints, transcript, map).length, 1);
  // Two point sentences in a row are one step.
  assertEquals(coachProblems(withOutput({ betterSentences: [{ text: 'Cats.', label: 'point' }, { text: 'Calm.', label: 'point' }] }), transcript, map), []);
  const noPoint = withOutput({ betterSentences: [{ text: 'Cats are calm.', label: 'support' }] });
  assertEquals(coachProblems(noPoint, transcript, map).length, 1);
  // An answer with no point may get a better version with none: the coach doesn't pick one for them.
  const pointless = { ...map, ...placeLabels(['support', 'support'], transcript) };
  assertEquals(coachProblems(noPoint, transcript, pointless), []);
});

Deno.test('problems: only an empty what-changed line is refused, so it never fails an answer over its wording', () => {
  assertEquals(coachProblems(withOutput({ whatChanged: ' ' }), transcript, map).length, 1);
  assertEquals(coachProblems(withOutput({ whatChanged: 'Your point comes first, e.g. the reorg aside is gone.' }), transcript, map), []);
});

Deno.test('a rejected reply is asked for again once, then accepted', async () => {
  const { model, seen } = modelThatSays(withOutput({ betterSentences: nineWords }), good);
  const failures: string[] = [];
  assertEquals((await coach(input, model, { onAttemptFailed: (e) => failures.push(e.message) })).tip, good.tip);
  assertEquals(seen.length, 2);
  assertEquals(failures.length, 1);
});

Deno.test('two rejected replies fail the stage', async () => {
  const { model } = modelThatSays(withOutput({ tip: '' }));
  await assertRejects(() => coach(input, model), Error, 'rejected');
});

Deno.test('notebook returns the trimmed notes, passes the old ones, and how the answer was built from the map', async () => {
  const { model, seen } = modelThatSays({ notes: '  Says like often.  ' });
  const notes = await updateNotebook({ previousNotes: 'old', map, metrics, tip: 'tip' }, model);
  assertEquals(notes, 'Says like often.');
  const sent = seen[0].input as { notes: string; built: unknown };
  assertEquals(sent.notes, 'old');
  assertEquals(seen[0].prompt.name, 'notebook');
  assertEquals(sent.built, {
    point: 'early',
    listenerKnewWhereAtSeconds: 0,
    offTrackPercent: 0,
    hasSupport: true,
    hasEnding: false,
    listenerLostTheThread: 0,
    restarts: 0,
    noticed: {},
  });
  // Never the person's own words: no quotes from the map.
  assertEquals(JSON.stringify(seen[0].input).includes('like cats'), false);
});

Deno.test('notebook never sees the measures that are stored but not shown', async () => {
  const { model, seen } = modelThatSays({ notes: 'ok' });
  const busy = testMetrics({ vagueWords: { total: 9, byWord: { thing: 9 } }, ands: { count: 30 }, pauses: [{ atSeconds: 2, ms: 1500, midSentence: true }, { atSeconds: 5, ms: 1200, midSentence: false }] });
  await updateNotebook({ previousNotes: '', map, metrics: busy, tip: 'tip' }, model);
  const sent = JSON.stringify((seen[0].input as { measurements: unknown }).measurements);
  assertEquals(/vague|thing|ands/.test(sent), false);
  assertEquals((seen[0].input as { measurements: { midSentencePauses: number } }).measurements.midSentencePauses, 1);
});

Deno.test('notebook that is too long is asked for again, then rejected', async () => {
  const long = { notes: 'x'.repeat(notebookMaxChars + 1) };
  const { model, seen } = modelThatSays(long);
  await assertRejects(() => updateNotebook({ previousNotes: '', map, metrics, tip: 'tip' }, model), Error, 'more than');
  assertEquals(seen.length, 2);
});

const tipOf = (words: number) => Array.from({ length: words }, (_, i) => `word${i}`).join(' ');

Deno.test(`the output schema refuses a tip over ${maxTipWords} words, using the same parse the SDK runs on every reply`, () => {
  // zodOutputFormat is what the Anthropic SDK uses to check each reply, so this is the real enforcement point.
  const format = zodOutputFormat(coachingOutputSchema);
  const reply = (tip: string) => JSON.stringify({ ...good, tip });
  assertEquals(format.parse(reply(tipOf(12))).tip.split(' ').length, 12);
  assertEquals(format.parse(reply(tipOf(maxTipWords))).tip.split(' ').length, maxTipWords);
  let error = '';
  try {
    format.parse(reply(tipOf(maxTipWords + 1)));
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  assertEquals(error.includes(`at most ${maxTipWords} words`), true);
  // The message gives the real count, which the retry hands back to the model.
  assertEquals(error.includes(`The tip is ${maxTipWords + 1} words`), true);
});

Deno.test('answers saved before the limit, the steps and what changed existed still load', () => {
  assertEquals(coachingSchema.safeParse({ tip: tipOf(60), betterVersion: 'x' }).success, true);
});

Deno.test('the coach stage hands the model the limited schema, so a long tip is refused and asked for again', async () => {
  const { model, seen } = modelThatSays(good);
  await coach(input, model);
  assertEquals(seen[0].schema.safeParse(withOutput({ tip: tipOf(maxTipWords + 1) })).success, false);
  assertEquals(seen[0].schema.safeParse(withOutput({ tip: tipOf(12) })).success, true);
});

Deno.test('the reason and what changed have their own limits, a little above what the coach is told', () => {
  assertEquals(coachingOutputSchema.safeParse(withOutput({ reason: tipOf(maxReasonWords) })).success, true);
  assertEquals(coachingOutputSchema.safeParse(withOutput({ reason: tipOf(maxReasonWords + 1) })).success, false);
  assertEquals(coachingOutputSchema.safeParse(withOutput({ whatChanged: tipOf(maxWhatChangedWords) })).success, true);
  assertEquals(coachingOutputSchema.safeParse(withOutput({ whatChanged: tipOf(maxWhatChangedWords + 1) })).success, false);
});

Deno.test('the second try is told why the first reply was refused', async () => {
  const { model, seen } = modelThatSays(withOutput({ betterSentences: nineWords }), good);
  await coach(input, model);
  assertEquals('previousAttemptProblem' in (seen[0].input as object), false);
  assertEquals(typeof (seen[1].input as { previousAttemptProblem: string }).previousAttemptProblem, 'string');
  assertEquals((seen[1].input as { previousAttemptProblem: string }).previousAttemptProblem.includes('better version'), true);
});

Deno.test('the problem handed back is the plain validation list, not the SDK\'s long JSON', () => {
  const sdk = new Error('Failed to parse structured output: [ { "code": "custom" } ]\nValidation issues:\n  - tip: The tip must be at most 30 words.');
  assertEquals(problemOf(sdk), '- tip: The tip must be at most 30 words.');
  assertEquals(problemOf(new Error('boom')), 'boom');
});
