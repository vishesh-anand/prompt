import { assertAlmostEquals, assertEquals, assertThrows } from 'jsr:@std/assert@1';

import type { MapOutput, StepLabel } from '../supabase/functions/_shared/schemas/map.ts';
import type { Transcript } from '../supabase/functions/_shared/schemas/metrics.ts';
import { compareReadings, problemKinds, readLabels, readMap, type Reading, restartSentences, sentenceLabels } from './mapScore.ts';

// Four sentences, from 2 s, one word a second, each word half a second long. Spoken from 2 s to 11.5 s: 9.5 seconds.
const said = ['So', 'yesterday.', 'I', 'like', 'cats.', 'Cats', 'are', 'calm.', 'So', 'cats.'];
const transcript: Transcript = {
  words: said.map((punctuated, i) => ({ text: punctuated.toLowerCase().replace(/[^a-z]/g, ''), punctuated, start: 2 + i, end: 2.5 + i })),
};

const map: MapOutput = {
  point: { restatement: 'You like cats.', quote: 'I like cats.' },
  steps: [
    { label: 'off_track', startsWith: 'So yesterday.' },
    { label: 'point', startsWith: 'I like cats.' },
    { label: 'support', startsWith: 'Cats are calm.' },
    { label: 'ending', startsWith: 'So cats.' },
  ],
  didntFollow: [],
  restarts: [{ quote: 'are calm.' }],
  noticed: [],
  effort: 2,
};

const reading = (labels: StepLabel[], changes: Partial<Reading> = {}): Reading => ({ labels, point: labels.includes('point') ? labels.indexOf('point') + 1 : null, restarts: [], pointAtSeconds: 0, offTrackShare: 0, ...changes });

Deno.test('each sentence gets the label of the step it starts in, also when a step covers several sentences', () => {
  assertEquals(sentenceLabels(map, transcript), ['off_track', 'point', 'support', 'ending']);
  const twoSentences = { ...map, steps: [{ label: 'support' as const, startsWith: 'So yesterday.' }, { label: 'ending' as const, startsWith: 'So cats.' }] };
  assertEquals(sentenceLabels(twoSentences, transcript), ['support', 'support', 'support', 'ending']);
});

Deno.test('restart quotes become sentence numbers, each once', () => {
  assertEquals(restartSentences(map, transcript), [3]);
  assertEquals(restartSentences({ ...map, restarts: [{ quote: 'Cats are' }, { quote: 'are calm.' }, { quote: 'So yesterday.' }] }, transcript), [1, 3]);
});

Deno.test('a reading from labels has the same time rules as the Map stage', () => {
  const read = readLabels(['off_track', 'point', 'support', 'ending'], [3], transcript);
  // "I" starts at 4 s, 2 s after the first word. Off track from 2 s to 4 s: 2 of 9.5 seconds.
  assertEquals(read, { labels: ['off_track', 'point', 'support', 'ending'], point: 2, restarts: [3], pointAtSeconds: 2, offTrackShare: 0.21 });
  assertEquals(readLabels(['direction', 'support', 'point', 'ending'], [], transcript).pointAtSeconds, 0);
  assertEquals(readLabels(['off_track', 'support', 'support', 'off_track'], [], transcript).point, null);
  assertEquals(readLabels(['off_track', 'support', 'support', 'off_track'], [], transcript).pointAtSeconds, null);
  // The last sentence runs to the last word's end: 2 s + 1.5 s of off track.
  assertEquals(readLabels(['off_track', 'support', 'support', 'off_track'], [], transcript).offTrackShare, 0.37);
  assertThrows(() => readLabels(['point'], [], transcript));
});

Deno.test('a map and the same labels read the same', () => {
  assertEquals(readMap(map, transcript), readLabels(['off_track', 'point', 'support', 'ending'], [3], transcript));
});

Deno.test('comparing two readers counts their sentences across all answers', () => {
  const same = compareReadings([{ first: reading(['point', 'support']), second: reading(['point', 'support']) }]);
  assertEquals(same.kappa, 1);
  assertEquals(same.samePoint, 1);
  assertEquals(same.sameRestartCount, 1);

  const pairs = [
    { first: reading(['point', 'support'], { restarts: [1], pointAtSeconds: 4, offTrackShare: 0.5 }), second: reading(['support', 'point'], { pointAtSeconds: 10, offTrackShare: 0.2 }) },
    { first: reading(['support', 'support'], { pointAtSeconds: null }), second: reading(['point', 'support'], { pointAtSeconds: 0 }) },
    { first: reading(['point', 'off_track'], { pointAtSeconds: 0 }), second: reading(['support', 'off_track'], { pointAtSeconds: null }) },
  ];
  const result = compareReadings(pairs);
  assertEquals(result.pairs, 3);
  assertEquals(result.sentences, 6);
  assertEquals(result.samePoint, 0);
  assertEquals(result.onlySecondFoundPoint, 1);
  assertEquals(result.onlyFirstFoundPoint, 1);
  assertEquals(result.firstFoundPoint, 2);
  assertEquals(result.secondFoundPoint, 2);
  assertEquals(result.firstRestarts, 1);
  assertEquals(result.secondRestarts, 0);
  assertEquals(result.sameRestartCount, 2);
  // Only the first answer has a time from both readers.
  assertEquals(result.secondsToPointDifference, 6);
  assertAlmostEquals(result.offTrackDifference, 0.1, 1e-9);
});

Deno.test('comparing no answers has no agreement to report', () => {
  const none = compareReadings([]);
  assertEquals(none.kappa, NaN);
  assertEquals(none.secondsToPointDifference, null);
});

Deno.test('refusal reasons lose the quoted words, and are counted by kind', () => {
  const kinds = problemKinds([
    'map reply rejected: "my private words" is not in the transcript; step 2 ("other words") must start at the start of a sentence',
    'map reply rejected: "more words" is not in the transcript; noticed pause "a; b" is not one of the counted items; choose only from those',
  ]);
  assertEquals(kinds, [
    { kind: '"..." is not in the transcript', times: 2 },
    { kind: 'a step ("...") must start at the start of a sentence', times: 1 },
    { kind: 'noticed pause "..." is not one of the counted items; choose only from those', times: 1 },
  ]);
});
