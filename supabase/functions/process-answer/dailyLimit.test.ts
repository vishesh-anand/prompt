import { assertEquals } from 'jsr:@std/assert@1';

import { dailyLimit, overDailyLimit } from './dailyLimit.ts';

Deno.test('the 10th answer of a day is allowed, the 11th is not', () => {
  assertEquals(overDailyLimit(9, 9), false);
  assertEquals(overDailyLimit(10, 10), true);
});

Deno.test('a busy day yesterday does not count against today', () => {
  assertEquals(overDailyLimit(0, 10), false);
  assertEquals(overDailyLimit(3, 12), false);
});

Deno.test('changing timezone cannot start a fresh day over and over: 20 answers in 24 hours is the most', () => {
  assertEquals(overDailyLimit(0, 19), false);
  assertEquals(overDailyLimit(0, 20), true);
});

Deno.test('the limit is 10', () => {
  assertEquals(dailyLimit, 10);
});
