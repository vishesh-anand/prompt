import { assertEquals } from 'jsr:@std/assert@1';

import type { SavedJudgement } from '../schemas/judgement.ts';
import type { Metrics } from '../schemas/metrics.ts';
import { chooseFocus } from './tipFocus.ts';

const mark = (score: 0 | 1 | 2, quote = 'q') => ({ score, quotes: [quote], why: 'w' });

// An answer with nothing wrong, to change one thing at a time.
const clean: { metrics: Metrics; judgement: SavedJudgement; stoppedByTimeLimit: boolean } = {
  metrics: {
    wordCount: 100,
    fillers: { total: 0, byWord: {} },
    pace: { wordsPerMinute: 140, band: 'good' },
    pauses: { count: 0, longestMs: 0, atSeconds: [] },
    restarts: { count: 0, atSeconds: [] },
  },
  judgement: { mainPoint: mark(2, 'I like cats.'), reasonOrExample: mark(2), ending: mark(2), mainPointAtSeconds: 2 },
  stoppedByTimeLimit: false,
};

const withJudgement = (j: Partial<SavedJudgement>) => ({ ...clean, judgement: { ...clean.judgement, ...j } });
const withMetrics = (m: Partial<Metrics>) => ({ ...clean, metrics: { ...clean.metrics, ...m } });

Deno.test('nothing wrong is a polish tip', () => {
  assertEquals(chooseFocus(clean).kind, 'polish');
});

Deno.test('a missing main point beats everything else', () => {
  const input = { ...withJudgement({ mainPoint: mark(0), ending: mark(0), reasonOrExample: mark(0) }), metrics: { ...clean.metrics, fillers: { total: 20, byWord: { um: 20 } } } };
  assertEquals(chooseFocus(input).kind, 'main_point');
});

Deno.test('main point facts say when it came and the words, and whether that was late', () => {
  const focus = chooseFocus(withJudgement({ mainPoint: mark(1, 'So, my point is cats.'), mainPointAtSeconds: 40 }));
  assertEquals(focus, { kind: 'main_point', facts: { quote: 'So, my point is cats.', judgeNote: 'w', startsAtSeconds: 40, cameLate: true } });
});

Deno.test('on a tie the earlier kind wins: main point before ending', () => {
  assertEquals(chooseFocus(withJudgement({ mainPoint: mark(1), ending: mark(1) })).kind, 'main_point');
});

Deno.test('an ending that was cut off by the timer is never the focus', () => {
  const input = { ...withJudgement({ ending: mark(0, 'and then the') }), stoppedByTimeLimit: true };
  assertEquals(chooseFocus(input).kind, 'polish');
  assertEquals(chooseFocus({ ...input, stoppedByTimeLimit: false }).kind, 'ending');
});

Deno.test('a weak reason or example ranks below a moderate problem elsewhere', () => {
  assertEquals(chooseFocus(withJudgement({ reasonOrExample: mark(0), ending: mark(1) })).kind, 'ending');
  assertEquals(chooseFocus(withJudgement({ reasonOrExample: mark(0) })).kind, 'reason_or_example');
});

Deno.test('fillers are judged per 100 words, with the most said first', () => {
  // 6 fillers in 100 words is moderate (2), and 3 in 100 is mild (1).
  const six = chooseFocus(withMetrics({ fillers: { total: 6, byWord: { like: 4, um: 2 } } }));
  assertEquals(six.kind, 'fillers');
  assertEquals(six.facts, { total: 6, per100Words: 6, mostSaid: [{ word: 'like', times: 4 }, { word: 'um', times: 2 }] });
  // The same 6 fillers in a 400-word answer is only 1.5 per 100: not worth a tip.
  assertEquals(chooseFocus(withMetrics({ wordCount: 400, fillers: { total: 6, byWord: { like: 6 } } })).kind, 'polish');
});

Deno.test('severe fillers beat a moderate weak ending', () => {
  const input = { ...withJudgement({ ending: mark(1) }), metrics: { ...clean.metrics, fillers: { total: 9, byWord: { um: 9 } } } };
  assertEquals(chooseFocus(input).kind, 'fillers');
});

Deno.test('speed and restarts only count when clearly off', () => {
  assertEquals(chooseFocus(withMetrics({ pace: { wordsPerMinute: 190, band: 'too_fast' } })).kind, 'speed');
  assertEquals(chooseFocus(withMetrics({ pace: { wordsPerMinute: null, band: null } })).kind, 'polish');
  assertEquals(chooseFocus(withMetrics({ restarts: { count: 3, atSeconds: [5, 9, 20] } })).kind, 'restarts');
  assertEquals(chooseFocus(withMetrics({ restarts: { count: 2, atSeconds: [5, 9] } })).kind, 'restarts');
  assertEquals(chooseFocus(withMetrics({ restarts: { count: 1, atSeconds: [5] } })).kind, 'polish');
});

Deno.test('an answer with no words has no filler rate to divide by', () => {
  assertEquals(chooseFocus(withMetrics({ wordCount: 0 })).kind, 'polish');
});
