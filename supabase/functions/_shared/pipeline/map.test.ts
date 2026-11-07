import { assertEquals, assertRejects, assertStringIncludes, assertThrows } from 'jsr:@std/assert@1';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@0.131.0/helpers/zod';

import type { Model, PromptFile } from '../providers/model.ts';
import { type MapOutput, mapOutputSchema, savedMapSchema, type StepLabel } from '../schemas/map.ts';
import type { Transcript } from '../schemas/metrics.ts';
import { testMetrics } from '../testMetrics.ts';
import { mapAnswer, mapProblems, mapVersion, numberedSentences, placeLabels, placeMoments, withoutPauseMarks } from './map.ts';
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
  sentences: [
    { sentence: 1, label: 'off_track' },
    { sentence: 2, label: 'point' },
    { sentence: 3, label: 'support' },
    { sentence: 4, label: 'ending' },
  ],
  didntFollow: [{ quote: 'yesterday I had a meeting', why: 'The meeting never comes back.' }],
  restarts: [],
  noticed: [{ kind: 'pause', quote: 'point is ship early', why: 'A long silence in the middle of the sentence.' }],
  effort: 2,
};

const labelled = (...labels: StepLabel[]): MapOutput => ({ ...good, sentences: labels.map((label, i) => ({ sentence: i + 1, label })) });
const numbered = (...sentence: number[]): MapOutput => ({ ...good, sentences: sentence.map((n) => ({ sentence: n, label: 'support' })) });
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

Deno.test('the text is numbered sentences, with long silences written where they fell; short gaps are not', () => {
  assertEquals(numberedSentences(transcript), '1. Um, so yesterday I had a meeting.\n2. My point is [2.0 s pause] ship early.\n3. Users told us.\n4. So ship early.');
});

Deno.test('the model gets the question, the text with pauses, the timer and what Measure counted, and nothing else', async () => {
  const { model, seen } = modelThatSays(good);
  await mapAnswer({ ...input, stoppedByTimeLimit: true }, model);
  assertEquals(seen[0].prompt.name, 'map');
  assertEquals(seen[0].input.question, 'Should we ship early?');
  assertStringIncludes(String(seen[0].input.transcript), '2. My point is [2.0 s pause] ship');
  assertEquals(seen[0].input.stoppedByTimeLimit, true);
  assertEquals(seen[0].input.counted, { fillers: { um: 1, so: 1 }, hedges: {}, repeats: 0, midSentencePauses: 1 });
  assertEquals(Object.keys(seen[0].input).sort(), ['counted', 'question', 'stoppedByTimeLimit', 'transcript']);
});

Deno.test('plain code adds each step time, when the point came and the off-track share', async () => {
  const { model } = modelThatSays(good);
  const map = await mapAnswer(input, model);
  assertEquals(map.steps.map((s) => [s.sentence, s.atSeconds]), [[1, 0], [2, 7], [3, 13.5], [4, 16.5]]);
  assertEquals(map.sentences, good.sentences);
  assertEquals(map.pointAtSeconds, 7);
  // Off track from 2 s to "My" at 9 s: 7 of the 19 seconds spoken.
  assertEquals(map.offTrackShare, 0.37);
  assertEquals(map.version, mapVersion);
  assertEquals(map.point, good.point);
  assertEquals(map.effort, 2);
});

Deno.test('plain code adds where the first word starts, each step\'s opening words and when each quoted moment starts', async () => {
  const { model } = modelThatSays({ ...good, restarts: [{ quote: 'Users told us' }] });
  const map = await mapAnswer(input, model);
  // The recording's first word starts at 2 s; moment times count from there, like the step times.
  assertEquals(map.firstWordAtSeconds, 2);
  assertEquals(map.steps.map((s) => s.opening), ['Um, so yesterday I had a meeting.', 'My point is ship early.', 'Users told us.', 'So ship early.']);
  assertEquals(map.didntFollow, [{ ...good.didntFollow[0], atSeconds: 2 }]);
  assertEquals(map.noticed, [{ ...good.noticed[0], atSeconds: 8 }]);
  assertEquals(map.restarts, [{ quote: 'Users told us', atSeconds: 13.5 }]);
});

Deno.test('placing moments again changes nothing, and a step opening stops after eight words', async () => {
  const { model } = modelThatSays(good);
  const map = await mapAnswer(input, model);
  assertEquals(placeMoments(map, transcript), map);
  const long: Transcript = { words: 'one two three four five six seven eight nine ten.'.split(' ').map((punctuated, i) => ({ text: punctuated, punctuated, start: i, end: i + 0.5 })) };
  const placed = placeMoments({ ...map, ...placeLabels(['point'], long), didntFollow: [], restarts: [], noticed: [] }, long);
  assertEquals(placed.steps[0].opening, 'one two three four five six seven eight');
});

Deno.test('a map saved before moments were placed still loads, so process-answer never pays to map it again', () => {
  const old = { ...good, version: 8, ...placeLabels(['off_track', 'point', 'support', 'ending'], transcript) };
  assertEquals(savedMapSchema.safeParse(old).success, true);
});

Deno.test('a frame before the point is when the listener knew where it was going', async () => {
  const { model } = modelThatSays(
    labelled('direction', 'point', 'support', 'support'),
  );
  const map = await mapAnswer(input, model);
  assertEquals(map.pointAtSeconds, 0);
  assertEquals(map.offTrackShare, 0);
});

Deno.test('an answer with no point has no point step, no point quote and no point time', async () => {
  const { model } = modelThatSays({
    ...labelled('off_track', 'off_track', 'support', 'support'),
    point: { restatement: 'You talked about a meeting and shipping, but I could not tell which was your point.', quote: '' },
  });
  const map = await mapAnswer(input, model);
  assertEquals(map.pointAtSeconds, null);
  // Off track until "Users" at 15.5 s: 13.5 of 19 seconds.
  assertEquals(map.offTrackShare, 0.71);
});

Deno.test('neighbouring sentences with the same label are one step, and a timer-stopped answer needs no ending', async () => {
  const { model } = modelThatSays({ ...labelled('point', 'point', 'support', 'support'), point: { ...good.point, quote: 'I had a meeting. My point' } });
  const map = await mapAnswer({ ...input, stoppedByTimeLimit: true }, model);
  assertEquals(map.steps.map(({ label, sentence, atSeconds }) => ({ label, sentence, atSeconds })), [{ label: 'point', sentence: 1, atSeconds: 0 }, { label: 'support', sentence: 3, atSeconds: 13.5 }]);
});

Deno.test('a good reply has no problems, and a quote across a pause mark still matches', () => {
  assertEquals(mapProblems(good, transcript, metrics), []);
  assertEquals(withoutPauseMarks('is [2.0 s pause] ship'), 'is   ship');
  assertEquals(mapProblems({ ...good, point: { ...good.point, quote: 'My point is [2.0 s pause] ship early' } }, transcript, metrics), []);
});

Deno.test('sentences: each labelled once, in order, from 1 to the last', () => {
  const refused = 'label sentences 1 to 4, each once and in order (the reply labels';
  assertEquals(mapProblems(numbered(1, 2, 3, 4), transcript, metrics).filter((p) => p.startsWith('label')), []);
  for (const wrong of [[1, 2, 4], [1, 2, 2, 3, 4], [1, 3, 2, 4], [1, 2, 3], [0, 1, 2, 3]]) {
    assertStringIncludes(mapProblems(numbered(...wrong), transcript, metrics).join(), `${refused} ${wrong.join(', ')}`);
  }
});

Deno.test('a sentence starting with any word, "And" included, gets its own label: no words are copied to place it', () => {
  const cats: Transcript = { words: ['I', 'like', 'cats.', 'And', 'I', 'would', 'recommend', 'them.'].map((punctuated, i) => ({ text: punctuated.toLowerCase().replace(/[^a-z]/g, ''), punctuated, start: i, end: i + 0.5 })) };
  assertEquals(placeLabels(['point', 'ending'], cats).steps, [{ label: 'point', sentence: 1, atSeconds: 0 }, { label: 'ending', sentence: 2, atSeconds: 3 }]);
  assertThrows(() => placeLabels(['point'], cats));
});

Deno.test('point: exactly one point step, and the point quote is inside it', () => {
  const twoPoints = labelled('point', 'off_track', 'point', 'ending');
  assertStringIncludes(mapProblems(twoPoints, transcript, metrics).join(), '2 steps are point');
  assertEquals(mapProblems({ ...good, point: { ...good.point, quote: '' } }, transcript, metrics), ['a step is point, but point.quote is empty']);
  const noPointStep = labelled('off_track', 'support', 'support', 'support');
  assertEquals(mapProblems(noPointStep, transcript, metrics), ['point.quote is given, but no step is point']);
  assertEquals(mapProblems({ ...good, point: { ...good.point, quote: 'Users told us' } }, transcript, metrics), ['point.quote "Users told us" is not inside the point step']);
  assertEquals(mapProblems({ ...good, point: { ...good.point, restatement: ' ' } }, transcript, metrics), ['the point restatement is empty']);
});

Deno.test('quotes: only the point quote may be empty', () => {
  const empty = 'a quote is empty; every didntFollow, restarts and noticed item quotes the words';
  assertEquals(mapProblems(noticing({ kind: 'hedge', quote: '', why: 'w' }), transcript, metrics), [empty]);
  assertEquals(mapProblems({ ...good, didntFollow: [{ quote: ' ', why: 'w' }] }, transcript, metrics), [empty]);
  assertEquals(mapProblems({ ...good, restarts: [{ quote: '' }] }, transcript, metrics), [empty]);
});

Deno.test('quotes: words repeated in a row are said once when the second match overlaps the first', () => {
  const said = ['I', 'think', 'I', 'think', 'I', 'think', 'the', 'plan', 'works.'];
  const stutter: Transcript = { words: said.map((punctuated, i) => ({ text: punctuated.toLowerCase().replace(/[^a-z]/g, ''), punctuated, start: i, end: i + 0.5 })) };
  const reply = { ...labelled('point'), point: { ...good.point, quote: 'the plan works' }, noticed: [], didntFollow: [] };
  assertEquals(mapProblems({ ...reply, restarts: [{ quote: 'I think I think I think' }] }, stutter, measure({ transcript: stutter })), []);
  assertEquals(mapProblems({ ...reply, restarts: [{ quote: 'I think I think' }] }, stutter, measure({ transcript: stutter })), []);
  assertStringIncludes(mapProblems({ ...reply, restarts: [{ quote: 'I think' }] }, stutter, measure({ transcript: stutter })).join(), 'appears more than once');
});

Deno.test('quotes: each is in the transcript and said only once', () => {
  assertEquals(mapProblems({ ...good, restarts: [{ quote: 'We went to the' }] }, transcript, metrics), ['"We went to the" is not in the transcript']);
  assertEquals(mapProblems({ ...good, didntFollow: [{ quote: 'ship early', why: 'w' }] }, transcript, metrics), ['"ship early" appears more than once; quote words that appear only once']);
});

Deno.test('answers measured before filler positions were saved: any counted filler word in the quote will do', () => {
  const { atSeconds: _, ...fillers } = metrics.fillers;
  const older = { ...metrics, fillers };
  assertEquals(mapProblems(noticing({ kind: 'fillers', quote: 'so yesterday I had a', why: 'w' }), transcript, older), []);
  assertEquals(mapProblems(noticing({ kind: 'fillers', quote: 'yesterday I had a meeting', why: 'w' }), transcript, older).length, 1);
});

Deno.test('noticed fillers and pauses must be ones Measure counted', () => {
  assertEquals(mapProblems(noticing({ kind: 'fillers', quote: 'Um, so yesterday I had', why: 'w' }), transcript, metrics), []);
  assertEquals(mapProblems(noticing({ kind: 'fillers', quote: 'yesterday I had a meeting', why: 'w' }), transcript, metrics).length, 1);
  // "so" is a counted filler, but not this one: it follows "Um," inside a sentence. Only the later "So" was counted.
  assertEquals(mapProblems(noticing({ kind: 'fillers', quote: 'so yesterday I had a', why: 'w' }), transcript, metrics).length, 1);
  assertEquals(mapProblems(noticing({ kind: 'fillers', quote: 'told us. So ship early.', why: 'w' }), transcript, metrics), []);

  // A pause counts when the quote spans a counted mid-sentence pause, or ends or starts right beside it.
  assertEquals(mapProblems(noticing({ kind: 'pause', quote: 'point is ship early', why: 'w' }), transcript, metrics), []);
  assertEquals(mapProblems(noticing({ kind: 'pause', quote: 'My point is', why: 'w' }), transcript, metrics), []);
  assertEquals(mapProblems(noticing({ kind: 'pause', quote: 'ship early. Users told', why: 'w' }), transcript, metrics), []);
  // Words not beside it are still refused, and so is a quote with no counted pause near it.
  assertEquals(mapProblems(noticing({ kind: 'pause', quote: 'My point', why: 'w' }), transcript, metrics).length, 1);
  assertEquals(mapProblems(noticing({ kind: 'pause', quote: 'Users told us. So', why: 'w' }), transcript, metrics).length, 1);
  assertEquals(mapProblems(noticing({ kind: 'pattern', quote: 'Users told us. So', why: 'w', nextStep: 'n' }), transcript, metrics), []);
});

Deno.test('a pattern needs its own next step, because no fixed line fits it; other kinds need none', () => {
  assertEquals(mapProblems(noticing({ kind: 'pattern', quote: 'Users told us. So', why: 'w' }), transcript, metrics), [
    'noticed pattern "Users told us. So" has no nextStep; give one',
  ]);
  assertEquals(mapProblems(noticing({ kind: 'pattern', quote: 'Users told us. So', why: 'w', nextStep: '  ' }), transcript, metrics).length, 1);
  assertEquals(mapProblems(noticing({ kind: 'pause', quote: 'point is ship early', why: 'w' }), transcript, metrics), []);
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

Deno.test('the SDK parse every reply goes through accepts a map, and refuses an unknown label, an effort of 6 or no sentences', () => {
  const format = zodOutputFormat(mapOutputSchema);
  assertEquals(format.parse(JSON.stringify(good)), good);
  assertThrows(() => format.parse(JSON.stringify({ ...good, effort: 6 })));
  assertThrows(() => format.parse(JSON.stringify(labelled('aside' as 'off_track'))));
  assertThrows(() => format.parse(JSON.stringify(labelled())));
});
