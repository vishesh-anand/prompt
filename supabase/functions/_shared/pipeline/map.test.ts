import { assertEquals, assertRejects, assertStringIncludes, assertThrows } from 'jsr:@std/assert@1';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@0.131.0/helpers/zod';

import type { Model, PromptFile } from '../providers/model.ts';
import { type MapOutput, mapOutputSchema } from '../schemas/map.ts';
import type { Transcript } from '../schemas/metrics.ts';
import { mapAnswer, mapProblems, transcriptWithPauses, withoutPauseMarks } from './map.ts';

// "Um, so yesterday I had a meeting. My point is [2.0 s pause] ship early. Users told us. So ship early."
// One word a second from 2 s, each half a second long, with a 2-second silence after "is" (mid-sentence).
const said = ['Um,', 'so', 'yesterday', 'I', 'had', 'a', 'meeting.', 'My', 'point', 'is', 'ship', 'early.', 'Users', 'told', 'us.', 'So', 'ship', 'early.'];
const transcript: Transcript = {
  words: said.map((punctuated, i) => {
    const start = 2 + i + (i >= 10 ? 1.5 : 0);
    return { text: punctuated.toLowerCase().replace(/[^a-z]/g, ''), punctuated, start, end: start + 0.5 };
  }),
};
// Spoken from 2 s to 21 s: 19 seconds.
const input = { question: 'Should we ship early?', transcript, stoppedByTimeLimit: false };

const good: MapOutput = {
  steps: [
    { label: 'off_track', startsWith: 'Um, so yesterday I had' },
    { label: 'point', startsWith: 'My point is ship early.' },
    { label: 'support', startsWith: 'Users told us.' },
    { label: 'ending', startsWith: 'So ship early.' },
  ],
  point: { restatement: 'You think we should ship early.', quote: 'ship early' },
  didntFollow: [{ quote: 'yesterday I had a meeting', why: 'The meeting never comes back.' }],
  restarts: [],
  noticed: [{ kind: 'pause', quote: 'My point is', why: 'A long silence in the middle of the sentence.' }],
  effort: 2,
};

const withSteps = (...steps: MapOutput['steps']): MapOutput => ({ ...good, steps });

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

Deno.test('the model gets the question, the text with pauses and whether the timer stopped it, and nothing else', async () => {
  const { model, seen } = modelThatSays(good);
  await mapAnswer({ ...input, stoppedByTimeLimit: true }, model);
  assertEquals(seen[0].prompt.name, 'map');
  assertEquals(seen[0].input.question, 'Should we ship early?');
  assertStringIncludes(String(seen[0].input.transcript), 'is [2.0 s pause] ship');
  assertEquals(seen[0].input.stoppedByTimeLimit, true);
  assertEquals(Object.keys(seen[0].input).sort(), ['question', 'stoppedByTimeLimit', 'transcript']);
});

Deno.test('plain code adds each step time, when the point came and the off-track share', async () => {
  const { model } = modelThatSays(good);
  const map = await mapAnswer(input, model);
  assertEquals(map.steps.map((s) => s.atSeconds), [0, 7, 13.5, 16.5]);
  assertEquals(map.pointAtSeconds, 7);
  // Off track from 2 s to "My" at 9 s: 7 of the 19 seconds spoken.
  assertEquals(map.offTrackShare, 0.37);
  assertEquals(map.version, 1);
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

Deno.test('an answer with no direction or point step has no point time', async () => {
  const { model } = modelThatSays({ ...withSteps({ label: 'off_track', startsWith: 'Um, so' }, { label: 'support', startsWith: 'Users told us.' }), point: { restatement: 'You talked about a meeting.', quote: '' } });
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

Deno.test('a first step that skips the opening words is refused, so a late point is never moved to the start', () => {
  // Taken as given, this would put the point at 0 s and lose the 7 seconds before it.
  const skipped = withSteps({ label: 'point', startsWith: 'My point is' }, { label: 'support', startsWith: 'Users told us.' });
  assertStringIncludes(mapProblems(skipped, transcript).join(), 'must start at the first word, "Um,"');
  assertEquals(mapProblems(withSteps({ label: 'off_track', startsWith: 'Um, so' }, { label: 'point', startsWith: 'My point is' }), transcript), []);
});

Deno.test('words said twice are placed after the step before', async () => {
  const { model } = modelThatSays(withSteps({ label: 'point', startsWith: 'Um, so' }, { label: 'support', startsWith: 'Users told us.' }, { label: 'ending', startsWith: 'ship early.' }));
  const map = await mapAnswer(input, model);
  // The second "ship early." at 19.5 s, not the first at 13.5 s.
  assertEquals(map.steps[2].atSeconds, 17.5);
});

Deno.test('a quote across a pause mark still matches', () => {
  assertEquals(withoutPauseMarks('is [2.0 s pause] ship'), 'is   ship');
  assertEquals(mapProblems({ ...good, point: { ...good.point, quote: 'My point is [2.0 s pause] ship early' } }, transcript), []);
});

Deno.test('problems: a made-up quote anywhere, and steps out of order', () => {
  assertEquals(mapProblems(good, transcript), []);
  assertEquals(mapProblems({ ...good, point: { ...good.point, quote: 'ship it late' } }, transcript).length, 1);
  assertEquals(mapProblems({ ...good, restarts: [{ quote: 'We went to the' }] }, transcript).length, 1);
  assertEquals(mapProblems({ ...good, noticed: [{ kind: 'fillers', quote: 'basically', why: 'w' }] }, transcript).length, 1);
  assertEquals(mapProblems({ ...good, didntFollow: [{ quote: 'the timer', why: 'w' }] }, transcript).length, 1);
  assertEquals(mapProblems({ ...good, point: { ...good.point, restatement: ' ' } }, transcript), ['the point restatement is empty']);
  assertEquals(mapProblems(withSteps({ label: 'point', startsWith: 'Um, so' }, { label: 'support', startsWith: 'Users told us.' }, { label: 'off_track', startsWith: 'yesterday I had' }), transcript).length, 1);
});

Deno.test('a made-up quote is asked for again once, and the second try is told why', async () => {
  const { model, seen } = modelThatSays({ ...good, point: { ...good.point, quote: 'ship it late' } }, good);
  const failures: string[] = [];
  const map = await mapAnswer(input, model, { onAttemptFailed: (e) => failures.push(e.message) });
  assertEquals(map.point.quote, 'ship early');
  assertEquals(seen.length, 2);
  assertEquals(failures.length, 1);
  assertStringIncludes(String(seen[1].input.previousAttemptProblem), '"ship it late" is not in the transcript');
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

Deno.test('the SDK parse every reply goes through accepts a map, and refuses an unknown label or an effort of 6', () => {
  const format = zodOutputFormat(mapOutputSchema);
  assertEquals(format.parse(JSON.stringify(good)), good);
  assertThrows(() => format.parse(JSON.stringify({ ...good, effort: 6 })));
  assertThrows(() => format.parse(JSON.stringify(withSteps({ label: 'aside' as 'off_track', startsWith: 'Um, so' }))));
  assertThrows(() => format.parse(JSON.stringify(withSteps())));
});
