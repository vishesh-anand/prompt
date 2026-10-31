import { assertAlmostEquals, assertEquals, assertThrows } from 'jsr:@std/assert@1';

import { bootstrap, cohenKappa, icc, iccWords } from './listenerStats.ts';

// The worked example in Shrout & Fleiss (1979), Table 2: 6 targets, 4 judges. Published ICC(2,1) = .29, ICC(2,4) = .62.
const shroutFleiss = [
  [9, 2, 5, 8],
  [6, 1, 3, 2],
  [8, 4, 6, 8],
  [7, 1, 2, 6],
  [10, 5, 6, 9],
  [6, 2, 4, 7],
];

Deno.test('icc matches the published worked example', () => {
  const { single, average } = icc(shroutFleiss);
  assertAlmostEquals(single, 0.29, 0.005);
  assertAlmostEquals(average, 0.62, 0.005);
});

Deno.test('friends who agree exactly get 1', () => {
  assertEquals(icc([[1, 1, 1], [3, 3, 3], [5, 5, 5]]).single, 1);
});

Deno.test('icc refuses gaps and a single friend', () => {
  assertThrows(() => icc([[1, 2], [3]]));
  assertThrows(() => icc([[1], [2]]));
});

Deno.test('bootstrap range is repeatable and contains the estimate', () => {
  const stat = (rows: number[][]) => icc(rows).average;
  const range = bootstrap(shroutFleiss, stat);
  assertEquals(range, bootstrap(shroutFleiss, stat));
  const value = stat(shroutFleiss);
  assertEquals(range[0] <= value && value <= range[1], true);
});

Deno.test('icc words follow Koo and Li', () => {
  assertEquals([0.49, 0.5, 0.8, 0.95].map(iccWords), ['poor', 'moderate', 'good', 'excellent']);
});

// A table of two raters' yes/no answers as two lists: yes-yes, yes-no, no-yes, no-no.
const fromTable = (yy: number, yn: number, ny: number, nn: number): [string[], string[]] => {
  const repeat = (label: string, n: number) => Array<string>(n).fill(label);
  return [
    [...repeat('y', yy + yn), ...repeat('n', ny + nn)],
    [...repeat('y', yy), ...repeat('n', yn), ...repeat('y', ny), ...repeat('n', nn)],
  ];
};

Deno.test('cohenKappa matches the textbook worked examples', () => {
  // 50 proposals: observed .70, chance .50, kappa .40.
  assertAlmostEquals(cohenKappa(...fromTable(20, 5, 10, 15)), 0.4, 1e-9);
  // The same 60% agreement with lopsided answers scores lower: 45, 15, 25, 15 gives .1304.
  assertAlmostEquals(cohenKappa(...fromTable(45, 15, 25, 15)), 0.1304, 1e-4);
});

Deno.test('cohenKappa: full agreement is 1, opposite answers are below 0, and one label everywhere has no answer', () => {
  assertEquals(cohenKappa(['a', 'b', 'c'], ['a', 'b', 'c']), 1);
  assertEquals(cohenKappa(['a', 'b'], ['b', 'a']), -1);
  assertEquals(cohenKappa(['a', 'a'], ['a', 'a']), NaN);
  assertThrows(() => cohenKappa(['a'], ['a', 'b']));
});
