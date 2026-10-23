import { assertEquals } from 'jsr:@std/assert@1';

import type { SavedJudgement } from '../schemas/judgement.ts';
import type { Metrics } from '../schemas/metrics.ts';
import { testMetrics } from '../testMetrics.ts';
import { chooseFocus } from './tipFocus.ts';

const mark = (score: 0 | 1 | 2, quote = 'q') => ({ score, quotes: [quote], why: 'w' });

// An answer with nothing wrong, to change one thing at a time.
const clean: { metrics: Metrics; judgement: SavedJudgement; stoppedByTimeLimit: boolean } = {
  metrics: testMetrics(),
  judgement: { mainPoint: mark(2, 'I like cats.'), reasonOrExample: mark(2), ending: mark(2), mainPointAtSeconds: 2 },
  stoppedByTimeLimit: false,
};

const withJudgement = (j: Partial<SavedJudgement>) => ({ ...clean, judgement: { ...clean.judgement, ...j } });
const withMetrics = (m: Parameters<typeof testMetrics>[0]) => ({ ...clean, metrics: testMetrics(m) });

Deno.test('nothing wrong is a polish tip', () => {
  assertEquals(chooseFocus(clean).kind, 'polish');
});

Deno.test('a missing main point beats everything else', () => {
  const input = { ...withJudgement({ mainPoint: mark(0), ending: mark(0), reasonOrExample: mark(0) }), metrics: testMetrics({ fillers: { total: 20, byWord: { um: 20 } } }) };
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

Deno.test('reason or example is the lowest priority: it only wins when nothing else is flagged', () => {
  // Alone, it is still a tip.
  assertEquals(chooseFocus(withJudgement({ reasonOrExample: mark(0) })).kind, 'reason_or_example');
  assertEquals(chooseFocus(withJudgement({ reasonOrExample: mark(1) })).kind, 'reason_or_example');
  // Against anything else flagged, even the mildest, it loses.
  assertEquals(chooseFocus(withJudgement({ reasonOrExample: mark(0), ending: mark(1) })).kind, 'ending');
  const mildFillers = withMetrics({ fillers: { total: 3, byWord: { like: 3 } } });
  assertEquals(chooseFocus({ ...mildFillers, judgement: { ...clean.judgement, reasonOrExample: mark(0) } }).kind, 'fillers');
  // A missing reason (0) still ranks above a general one (1) when both are the only thing flagged.
  assertEquals(chooseFocus(withJudgement({ reasonOrExample: mark(0, 'nothing') })).facts.quote, 'nothing');
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
  const input = { ...withJudgement({ ending: mark(1) }), metrics: testMetrics({ fillers: { total: 9, byWord: { um: 9 } } }) };
  assertEquals(chooseFocus(input).kind, 'fillers');
});

Deno.test('speed only counts when clearly off', () => {
  assertEquals(chooseFocus(withMetrics({ pace: { wordsPerMinute: 190, band: 'too_fast' } })).kind, 'speed');
  assertEquals(chooseFocus(withMetrics({ pace: { wordsPerMinute: null, band: null } })).kind, 'polish');
});

Deno.test('repeats, hedges, pauses, vague words and "and" are never the tip', () => {
  const busy = withMetrics({
    repeats: { count: 9, atSeconds: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    hedges: { total: 5, byPhrase: { 'kind of': 5 }, atSeconds: [1, 2, 3, 4, 5] },
    pauses: [{ atSeconds: 3, ms: 2500, midSentence: true }],
    vagueWords: { total: 8, byWord: { thing: 8 } },
    ands: { count: 20 },
  });
  assertEquals(chooseFocus(busy).kind, 'polish');
});

Deno.test('an answer with no words has no filler rate to divide by', () => {
  assertEquals(chooseFocus(withMetrics({ wordCount: 0 })).kind, 'polish');
});
