import { assertEquals, assertRejects, assertStringIncludes, assertThrows } from 'jsr:@std/assert@1';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@0.131.0/helpers/zod';

import type { Model, PromptFile } from '../providers/model.ts';
import { type MapOutput, mapOutputSchema } from '../schemas/map.ts';
import type { Transcript } from '../schemas/metrics.ts';
import { testMetrics } from '../testMetrics.ts';
import { mapAnswer, mapProblems, transcriptWithPauses, withoutPauseMarks } from './map.ts';
import { measure } from './measure.ts';

// "Um, so yesterday I had a meeting. My point is [2.0 s pause] ship early. Users told us. So ship early."
// One word a second from 2 s, each half a second long, with a 2-second silence after "is" (mid-sentence).
const said = ['Um,', 'so', 'yesterday', 'I', 'had', 'a', 'meeting.', 'My', 'point', 'is', 'ship', 'early.', 'Users', 'told', 'us.', 'So', 'ship', 'early.'];
const transcript: Transcript = {
  words: said.map((punctuated, i) => {
    const start = 2 + i + (i >= 10 ? 1.5 : 0);
    return { text: punctuated.toLowerCase().replace(/[^a-z]/g, ''), punctuated, start, end: start + 0.5 };
  }),
};
// Spoken from 2 s to 21 s: 19 seconds. Measure counts "um", the "So" that starts a sentence, and the pause after "is".
const metrics = measure({ transcript });
const input = { question: 'Should we ship early?', transcript, metrics, stoppedByTimeLimit: false };

const good: MapOutput = {
  point: { restatement: 'You think we should ship early.', quote: 'My point is ship early' },
  steps: [
    { label: 'off_track', startsWith: 'Um, so yesterday I had' },
    { label: 'point', startsWith: 'My point is ship early.' },
    { label: 'support', startsWith: 'Users told us.' },
    { label: 'ending', startsWith: 'So ship early.' },
  ],
  didntFollow: [{ quote: 'yesterday I had a meeting', why: 'The meeting never comes back.' }],
  restarts: [],
  noticed: [{ kind: 'pause', quote: 'point is ship early', why: 'A long silence in the middle of the sentence.' }],
  effort: 2,
};

const withSteps = (...steps: MapOutput['steps']): MapOutput => ({ ...good, steps });
const noticing = (...noticed: MapOutput['noticed']): MapOutput => ({ ...good, noticed });

// A model that replies with each reply in turn, and remembers what it was asked.
function modelThatSays(...replies: MapOutput[]) {
  const seen: { prompt: PromptFile; input: Record<string, unknown> }[] = [];
  const model: Model = {
    generate<T>(args: { prompt: PromptFile; input: unknown }) {
      seen.push({ prompt: args.prompt, input: args.input as Record<string, unknown> });
      return Promise.resolve(replies[Math.min(seen.length - 1, replies.length - 1)] as unknown as T);
    },
  };
  return { model, seen };
}

Deno.test('long silences are written into the text where they fell; short gaps are not', () => {
  assertEquals(transcriptWithPauses(transcript), 'Um, so yesterday I had a meeting. My point is [2.0 s pause] ship early. Users told us. So ship early.');
});

Deno.test('the model gets the question, the text with pauses, the timer and what Measure counted, and nothing else', async () => {
  const { model, seen } = modelThatSays(good);
  await mapAnswer({ ...input, stoppedByTimeLimit: true }, model);
  assertEquals(seen[0].prompt.name, 'map');
  assertEquals(seen[0].input.question, 'Should we ship early?');
  assertStringIncludes(String(seen[0].input.transcript), 'is [2.0 s pause] ship');
  assertEquals(seen[0].input.stoppedByTimeLimit, true);
  assertEquals(seen[0].input.counted, { fillers: { um: 1, so: 1 }, hedges: {}, repeats: 0, midSentencePauses: 1 });
  assertEquals(Object.keys(seen[0].input).sort(), ['counted', 'question', 'stoppedByTimeLimit', 'transcript']);
});

Deno.test('plain code adds each step time, when the point came and the off-track share', async () => {
  const { model } = modelThatSays(good);
  const map = await mapAnswer(input, model);
  assertEquals(map.steps.map((s) => s.atSeconds), [0, 7, 13.5, 16.5]);
  assertEquals(map.pointAtSeconds, 7);
  // Off track from 2 s to "My" at 9 s: 7 of the 19 seconds spoken.
  assertEquals(map.offTrackShare, 0.37);
  assertEquals(map.version, 2);
  assertEquals(map.point, good.point);
  assertEquals(map.effort, 2);
});

Deno.test('a frame before the point is when the listener knew where it was going', async () => {
  const { model } = modelThatSays(
    withSteps({ label: 'direction', startsWith: 'Um, so yesterday' }, { label: 'point', startsWith: 'My point is' }, { label: 'support', startsWith: 'Users told us.' }),
  );
  const map = await mapAnswer(input, model);
  assertEquals(map.pointAtSeconds, 0);
  assertEquals(map.offTrackShare, 0);
});

Deno.test('an answer with no point has no point step, no point quote and no point time', async () => {
  const { model } = modelThatSays({
    ...withSteps({ label: 'off_track', startsWith: 'Um, so' }, { label: 'support', startsWith: 'Users told us.' }),
    point: { restatement: 'You talked about a meeting and shipping, but I could not tell which was your point.', quote: '' },
  });
  const map = await mapAnswer(input, model);
  assertEquals(map.pointAtSeconds, null);
  // Off track until "Users" at 15.5 s: 13.5 of 19 seconds.
  assertEquals(map.offTrackShare, 0.71);
});

Deno.test('a timer-stopped answer with no ending step is a normal map', async () => {
  const { model } = modelThatSays(withSteps({ label: 'point', startsWith: 'Um, so yesterday' }, { label: 'support', startsWith: 'Users told us.' }));
  const map = await mapAnswer({ ...input, stoppedByTimeLimit: true }, model);
  assertEquals(map.steps.map((s) => s.label), ['point', 'support']);
});

Deno.test('a good reply has no problems, and a quote across a pause mark still matches', () => {
  assertEquals(mapProblems(good, transcript, metrics), []);
  assertEquals(withoutPauseMarks('is [2.0 s pause] ship'), 'is   ship');
  assertEquals(mapProblems({ ...good, point: { ...good.point, quote: 'My point is [2.0 s pause] ship early' } }, transcript, metrics), []);
});

Deno.test('steps: the first starts at the first word, so a late point is never moved to the start', () => {
  // Taken as given, this would put the point at 0 s and lose the 7 seconds before it.
  const skipped = withSteps({ label: 'point', startsWith: 'My point is' }, { label: 'support', startsWith: 'Users told us.' });
  assertStringIncludes(mapProblems(skipped, transcript, metrics).join(), 'must start at the first word, "Um,"');
});

Deno.test('steps: each starts at the start of a sentence', () => {
  const midSentence = withSteps({ label: 'off_track', startsWith: 'Um, so yesterday' }, { label: 'point', startsWith: 'a meeting. My point is' });
  assertStringIncludes(mapProblems(midSentence, transcript, metrics).join(), 'must start at the start of a sentence');
});

Deno.test('steps: opening words that appear earlier are refused, so a step is never placed at the wrong mention', () => {
  // "So" starts the last sentence, but also appears at the second word.
  const early = withSteps({ label: 'point', startsWith: 'Um, so yesterday' }, { label: 'support', startsWith: 'Users told us.' }, { label: 'ending', startsWith: 'So' });
  assertStringIncludes(mapProblems(early, transcript, metrics).join(), 'also appears earlier');
});

Deno.test('steps: in order, and every one is in the transcript', () => {
  const backwards = withSteps({ label: 'off_track', startsWith: 'Um, so yesterday' }, { label: 'support', startsWith: 'Users told us.' }, { label: 'point', startsWith: 'My point is ship' });
  assertStringIncludes(mapProblems(backwards, transcript, metrics).join(), 'step 3 ("My point is ship") is not in the transcript after step 2');
});

Deno.test('point: exactly one point step, and the point quote is inside it', () => {
  const twoPoints = withSteps({ label: 'point', startsWith: 'Um, so yesterday' }, { label: 'point', startsWith: 'My point is' });
  assertStringIncludes(mapProblems(twoPoints, transcript, metrics).join(), '2 steps are point');
  assertEquals(mapProblems({ ...good, point: { ...good.point, quote: '' } }, transcript, metrics), ['a step is point, but point.quote is empty']);
  const noPointStep = withSteps({ label: 'off_track', startsWith: 'Um, so yesterday' }, { label: 'support', startsWith: 'Users told us.' });
  assertEquals(mapProblems(noPointStep, transcript, metrics), ['point.quote is given, but no step is point']);
  assertEquals(mapProblems({ ...good, point: { ...good.point, quote: 'Users told us' } }, transcript, metrics), ['point.quote "Users told us" is not inside the point step']);
  assertEquals(mapProblems({ ...good, point: { ...good.point, restatement: ' ' } }, transcript, metrics), ['the point restatement is empty']);
});

Deno.test('quotes: each is in the transcript and said only once', () => {
  assertEquals(mapProblems({ ...good, restarts: [{ quote: 'We went to the' }] }, transcript, metrics), ['"We went to the" is not in the transcript']);
  assertEquals(mapProblems({ ...good, didntFollow: [{ quote: 'ship early', why: 'w' }] }, transcript, metrics), ['"ship early" appears more than once; quote words that appear only once']);
});

Deno.test('noticed fillers and pauses must be ones Measure counted', () => {
  assertEquals(mapProblems(noticing({ kind: 'fillers', quote: 'Um, so yesterday I had', why: 'w' }), transcript, metrics), []);
  assertEquals(mapProblems(noticing({ kind: 'fillers', quote: 'yesterday I had a meeting', why: 'w' }), transcript, metrics).length, 1);
  // A pause counts only when the quote spans a counted mid-sentence pause.
  assertEquals(mapProblems(noticing({ kind: 'pause', quote: 'Users told us. So', why: 'w' }), transcript, metrics).length, 1);
  assertEquals(mapProblems(noticing({ kind: 'pause', quote: 'My point is', why: 'w' }), transcript, metrics).length, 1);
  assertEquals(mapProblems(noticing({ kind: 'pattern', quote: 'Users told us. So', why: 'w' }), transcript, metrics), []);
});

Deno.test('noticed repeats and hedges must fall where Measure counted them', () => {
  // "Users" starts at 15.5 s.
  const countedThere = testMetrics({ repeats: { count: 1, atSeconds: [15.5] }, hedges: { total: 1, byPhrase: { 'i guess': 1 }, atSeconds: [15.5] } });
  for (const kind of ['repeat', 'hedge'] as const) {
    assertEquals(mapProblems(noticing({ kind, quote: 'Users told us. So', why: 'w' }), transcript, countedThere), []);
    assertEquals(mapProblems(noticing({ kind, quote: 'yesterday I had a meeting', why: 'w' }), transcript, countedThere).length, 1);
    assertEquals(mapProblems(noticing({ kind, quote: 'Users told us. So', why: 'w' }), transcript, metrics).length, 1);
  }
});

Deno.test('a refused reply is asked for again once, and the second try is told why', async () => {
  const { model, seen } = modelThatSays({ ...good, point: { ...good.point, quote: 'ship it late' } }, good);
  const failures: string[] = [];
  const map = await mapAnswer(input, model, { onAttemptFailed: (e) => failures.push(e.message) });
  assertEquals(map.point.quote, 'My point is ship early');
  assertEquals(seen.length, 2);
  assertEquals(failures.length, 1);
  assertStringIncludes(String(seen[1].input.previousAttemptProblem), 'point.quote "ship it late" is not inside the point step');
});

Deno.test('gives up after two bad replies', async () => {
  const { model, seen } = modelThatSays({ ...good, point: { ...good.point, quote: 'ship it late' } });
  await assertRejects(() => mapAnswer(input, model), Error, 'not in the transcript');
  assertEquals(seen.length, 2);
});

Deno.test('an answer with no words is never sent to the model', async () => {
  const { model, seen } = modelThatSays(good);
  await assertRejects(() => mapAnswer({ ...input, transcript: { words: [] } }, model), Error, 'no words');
  assertEquals(seen.length, 0);
});

Deno.test('the SDK parse every reply goes through accepts a map, and refuses an unknown label, an effort of 6 or no steps', () => {
  const format = zodOutputFormat(mapOutputSchema);
  assertEquals(format.parse(JSON.stringify(good)), good);
  assertThrows(() => format.parse(JSON.stringify({ ...good, effort: 6 })));
  assertThrows(() => format.parse(JSON.stringify(withSteps({ label: 'aside' as 'off_track', startsWith: 'Um, so' }))));
  assertThrows(() => format.parse(JSON.stringify(withSteps())));
});
