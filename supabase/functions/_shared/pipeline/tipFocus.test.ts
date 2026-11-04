import { assertEquals } from 'jsr:@std/assert@1';

import type { SavedMap, StepLabel } from '../schemas/map.ts';
import type { Metrics, Transcript } from '../schemas/metrics.ts';
import { testMetrics } from '../testMetrics.ts';
import { placeLabels } from './map.ts';
import { chooseFocus, pointArrival } from './tipFocus.ts';

// Six sentences, one every 10 seconds from 0, each word half a second long.
const said = [
  'So my week was busy.',
  'We had the reorg and I moved teams.',
  'My point is we should ship early.',
  'Users told us they wanted it.',
  'Um the timer thing was odd.',
  'So ship early.',
];
const transcript: Transcript = {
  words: said.flatMap((sentence, n) =>
    sentence.split(' ').map((punctuated, i) => ({ text: punctuated.toLowerCase().replace(/[^a-z]/g, ''), punctuated, start: n * 10 + i * 0.5, end: n * 10 + i * 0.5 + 0.5 })),
  ),
};

// A map with these labels for the six sentences, and nothing noticed.
function mapOf(labels: StepLabel[], changes: Partial<SavedMap> = {}): SavedMap {
  return {
    point: { restatement: 'You think we should ship early.', quote: labels.includes('point') ? 'we should ship early' : '' },
    sentences: labels.map((label, i) => ({ sentence: i + 1, label })),
    didntFollow: [],
    restarts: [],
    noticed: [],
    effort: 2,
    version: 8,
    ...placeLabels(labels, transcript),
    ...changes,
  };
}

// Point first, support, ending: nothing to fix.
const clean = mapOf(['point', 'support', 'support', 'support', 'support', 'ending']);
const input = (map: SavedMap, changes: { metrics?: Metrics; wantsDirectAnswer?: boolean; stoppedByTimeLimit?: boolean } = {}) => ({
  metrics: testMetrics(),
  map,
  transcript,
  wantsDirectAnswer: false,
  stoppedByTimeLimit: false,
  ...changes,
});

Deno.test('nothing wrong is a polish tip', () => {
  assertEquals(chooseFocus(input(clean)), { kind: 'polish', facts: {} });
});

Deno.test('no point step beats everything, and says what the listener heard', () => {
  const map = mapOf(['off_track', 'off_track', 'support', 'support', 'off_track', 'support']);
  assertEquals(chooseFocus(input(map, { wantsDirectAnswer: true })), { kind: 'no_point', facts: { listenerHeard: 'You think we should ship early.' } });
});

Deno.test('a late point found after circling: when the listener knew, how many passes, and the first words', () => {
  const map = mapOf(['off_track', 'off_track', 'point', 'support', 'support', 'ending']);
  assertEquals(chooseFocus(input(map)), {
    kind: 'found_late',
    facts: { listenerKnewWhereAtSeconds: 20, passesAroundItFirst: 1, firstWords: 'So my week was busy.', pointQuote: 'we should ship early' },
  });
});

Deno.test('circling that ends by 15 seconds is not late', () => {
  // Off track 0 to 10 s, point at 10 s.
  assertEquals(chooseFocus(input(mapOf(['off_track', 'point', 'support', 'support', 'support', 'ending']))).kind, 'polish');
});

Deno.test('a late point that was chosen is no tip, unless the question wanted a direct answer', () => {
  const chosen = mapOf(['direction', 'support', 'point', 'support', 'support', 'ending']);
  assertEquals(chooseFocus(input(chosen)).kind, 'polish');
  assertEquals(chooseFocus(input(chosen, { wantsDirectAnswer: true })), {
    kind: 'direct_late',
    facts: { pointAtSeconds: 20, pointQuote: 'we should ship early', firstWords: 'So my week was busy.', questionWantedADirectAnswer: true },
  });
});

Deno.test('a direct question answered within 15 seconds is fine', () => {
  assertEquals(chooseFocus(input(mapOf(['support', 'point', 'support', 'support', 'support', 'ending']), { wantsDirectAnswer: true })).kind, 'polish');
});

Deno.test('a quarter of the time off track is a tip, with where each part started', () => {
  const map = mapOf(['point', 'support', 'support', 'support', 'off_track', 'ending']);
  // Off track from 40 s to 50 s of 51.5 s spoken: 19%, not enough.
  assertEquals(chooseFocus(input(map)).kind, 'polish');
  const more = mapOf(['point', 'off_track', 'support', 'support', 'off_track', 'ending']);
  assertEquals(chooseFocus(input(more)), {
    kind: 'off_track',
    facts: {
      offTrackPercent: 39,
      offTrackParts: [
        { atSeconds: 10, firstWords: 'We had the reorg and I moved teams.' },
        { atSeconds: 40, firstWords: 'Um the timer thing was odd.' },
      ],
    },
  });
});

Deno.test('no ending is a tip, unless the timer stopped the answer', () => {
  const map = mapOf(['point', 'support', 'support', 'support', 'support', 'support']);
  assertEquals(chooseFocus(input(map)), { kind: 'ending', facts: { lastWords: 'the timer thing was odd. So ship early.', pointQuote: 'we should ship early' } });
  assertEquals(chooseFocus(input(map, { stoppedByTimeLimit: true })).kind, 'polish');
});

Deno.test('what a listener noticed: the kind with the most moments, each with its time', () => {
  const map = mapOf(['point', 'support', 'support', 'support', 'support', 'ending'], {
    noticed: [
      { kind: 'hedge', quote: 'the reorg and I moved', why: 'h' },
      { kind: 'fillers', quote: 'Um the timer thing was', why: 'f1' },
      { kind: 'fillers', quote: 'So ship early', why: 'f2' },
    ],
  });
  const metrics = testMetrics({ fillers: { total: 3, byWord: { so: 2, um: 1 } } });
  assertEquals(chooseFocus(input(map, { metrics })), {
    kind: 'noticed',
    facts: {
      what: 'fillers',
      moments: [
        { quote: 'Um the timer thing was', atSeconds: 40, why: 'f1' },
        { quote: 'So ship early', atSeconds: 50, why: 'f2' },
      ],
      fillerCounts: { so: 2, um: 1 },
    },
  });
});

Deno.test('on a tie of noticed kinds the earlier one wins: a pause before a hedge', () => {
  const map = mapOf(['point', 'support', 'support', 'support', 'support', 'ending'], {
    noticed: [
      { kind: 'hedge', quote: 'the reorg and I moved', why: 'h' },
      { kind: 'pause', quote: 'Users told us they', why: 'p' },
    ],
  });
  assertEquals(chooseFocus(input(map)).facts.what, 'pause');
});

Deno.test('one restart is normal speech; two join what was noticed', () => {
  const one = mapOf(['point', 'support', 'support', 'support', 'support', 'ending'], { restarts: [{ quote: 'We had the reorg and' }] });
  assertEquals(chooseFocus(input(one)).kind, 'polish');
  const two = { ...one, restarts: [{ quote: 'We had the reorg and' }, { quote: 'Users told us they' }] };
  const focus = chooseFocus(input(two));
  assertEquals(focus.kind, 'noticed');
  assertEquals(focus.facts.what, 'restart');
});

Deno.test('noticed beats speed, and the ending beats noticed', () => {
  const noticed = { noticed: [{ kind: 'pause' as const, quote: 'Users told us they', why: 'p' }] };
  const fast = testMetrics({ pace: { wordsPerMinute: 190, band: 'too_fast' } });
  assertEquals(chooseFocus(input(mapOf(['point', 'support', 'support', 'support', 'support', 'ending'], noticed), { metrics: fast })).kind, 'noticed');
  assertEquals(chooseFocus(input(mapOf(['point', 'support', 'support', 'support', 'support', 'support'], noticed))).kind, 'ending');
});

Deno.test('speed only counts when clearly off', () => {
  assertEquals(chooseFocus(input(clean, { metrics: testMetrics({ pace: { wordsPerMinute: 190, band: 'too_fast' } }) })).facts, { band: 'too_fast', wordsPerMinute: 190 });
  assertEquals(chooseFocus(input(clean, { metrics: testMetrics({ pace: { wordsPerMinute: null, band: null } }) })).kind, 'polish');
});

Deno.test('no reason or example is the last thing worth a tip', () => {
  assertEquals(chooseFocus(input(mapOf(['point', 'point', 'point', 'point', 'point', 'ending']))), { kind: 'support', facts: { pointQuote: 'we should ship early' } });
});

Deno.test('counted fillers, hedges, repeats, vague words and "and" are never the tip on their own: only what the map noticed', () => {
  const busy = testMetrics({
    fillers: { total: 30, byWord: { um: 30 } },
    repeats: { count: 9, atSeconds: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    hedges: { total: 5, byPhrase: { 'kind of': 5 }, atSeconds: [1, 2, 3, 4, 5] },
    pauses: [{ atSeconds: 3, ms: 2500, midSentence: true }],
    vagueWords: { total: 8, byWord: { thing: 8 } },
    ands: { count: 20 },
  });
  assertEquals(chooseFocus(input(clean, { metrics: busy })).kind, 'polish');
});

Deno.test('how the point arrived: none, early, found late or chosen late', () => {
  assertEquals(pointArrival(mapOf(['support', 'support', 'support', 'support', 'support', 'support'])), 'none');
  assertEquals(pointArrival(clean), 'early');
  // A frame at 0 s means the listener knew where it was going early, even with the point itself at 20 s.
  assertEquals(pointArrival(mapOf(['direction', 'support', 'point', 'support', 'support', 'ending'])), 'early');
  assertEquals(pointArrival(mapOf(['off_track', 'off_track', 'point', 'support', 'support', 'ending'])), 'found_late');
  assertEquals(pointArrival(mapOf(['support', 'support', 'point', 'support', 'support', 'ending'])), 'chosen_late');
});
