import { assertEquals } from 'jsr:@std/assert@1';

import { dayStartIn } from './dayStart.ts';

const at = (iso: string) => new Date(iso);
const start = (tz: string | null, iso: string) => dayStartIn(tz, at(iso)).toISOString();

Deno.test('no timezone, or one that does not exist, means the UTC day', () => {
  assertEquals(start(null, '2026-10-10T15:30:00Z'), '2026-10-10T00:00:00.000Z');
  assertEquals(start('Not/AZone', '2026-10-10T15:30:00Z'), '2026-10-10T00:00:00.000Z');
  assertEquals(start('', '2026-10-10T15:30:00Z'), '2026-10-10T00:00:00.000Z');
});

Deno.test('UTC itself', () => {
  assertEquals(start('UTC', '2026-10-10T23:59:59Z'), '2026-10-10T00:00:00.000Z');
});

Deno.test('New York in summer time (UTC-4): 11pm Oct 10 local is still Oct 10', () => {
  // 03:30Z on Oct 11 is 11:30pm on Oct 10 in New York, so the day began 04:00Z on Oct 10.
  assertEquals(start('America/New_York', '2026-10-11T03:30:00Z'), '2026-10-10T04:00:00.000Z');
  assertEquals(start('America/New_York', '2026-10-11T04:00:00Z'), '2026-10-11T04:00:00.000Z');
  assertEquals(start('America/New_York', '2026-10-11T03:59:59Z'), '2026-10-10T04:00:00.000Z');
});

Deno.test('New York in winter time (UTC-5)', () => {
  assertEquals(start('America/New_York', '2026-12-05T02:00:00Z'), '2026-12-04T05:00:00.000Z');
});

Deno.test('New York on the day clocks go back (2026-11-01, 25 hours): the day starts at UTC-4 midnight', () => {
  assertEquals(start('America/New_York', '2026-11-01T12:00:00Z'), '2026-11-01T04:00:00.000Z');
  // 05:30Z is 12:30am EST, after the clocks went back, still the same local day.
  assertEquals(start('America/New_York', '2026-11-01T05:30:00Z'), '2026-11-01T04:00:00.000Z');
  // The next day starts at UTC-5 midnight, 25 hours later.
  assertEquals(start('America/New_York', '2026-11-02T10:00:00Z'), '2026-11-02T05:00:00.000Z');
});

Deno.test('New York on the day clocks go forward (2026-03-08, 23 hours)', () => {
  assertEquals(start('America/New_York', '2026-03-08T20:00:00Z'), '2026-03-08T05:00:00.000Z');
  assertEquals(start('America/New_York', '2026-03-09T12:00:00Z'), '2026-03-09T04:00:00.000Z');
});

Deno.test('Kolkata (UTC+5:30): the day starts at 18:30Z the day before', () => {
  assertEquals(start('Asia/Kolkata', '2026-10-10T10:00:00Z'), '2026-10-09T18:30:00.000Z');
  assertEquals(start('Asia/Kolkata', '2026-10-10T19:00:00Z'), '2026-10-10T18:30:00.000Z');
});

Deno.test('Auckland (UTC+13 in summer), Los Angeles late evening', () => {
  // 12:00Z on Dec 31 is already 1am on Jan 1 in Auckland, so that local day began at 11:00Z on Dec 31.
  assertEquals(start('Pacific/Auckland', '2026-12-31T12:00:00Z'), '2026-12-31T11:00:00.000Z');
  assertEquals(start('America/Los_Angeles', '2026-10-11T06:59:00Z'), '2026-10-10T07:00:00.000Z');
});

import { dayKeyIn, weekStartIn } from './dayStart.ts';

const week = (tz: string | null, iso: string) => weekStartIn(tz, at(iso)).toISOString();

Deno.test('dayKeyIn is the person\'s calendar day, not the UTC day', () => {
  assertEquals(dayKeyIn('America/New_York', at('2026-10-11T03:30:00Z')), '2026-10-10');
  assertEquals(dayKeyIn('Asia/Tokyo', at('2026-10-10T20:00:00Z')), '2026-10-11');
  assertEquals(dayKeyIn(null, at('2026-10-10T23:59:00Z')), '2026-10-10');
  assertEquals(dayKeyIn('Not/AZone', at('2026-10-10T23:59:00Z')), '2026-10-10');
});

Deno.test('the week starts on Monday at midnight in New York', () => {
  // Saturday Oct 10 2026 -> Monday Oct 5, midnight UTC-4.
  assertEquals(week('America/New_York', '2026-10-10T15:00:00Z'), '2026-10-05T04:00:00.000Z');
  // Monday itself, just after midnight local.
  assertEquals(week('America/New_York', '2026-10-05T04:00:00Z'), '2026-10-05T04:00:00.000Z');
  // The last minute of Sunday local (03:59Z Monday) is still that week.
  assertEquals(week('America/New_York', '2026-10-12T03:59:00Z'), '2026-10-05T04:00:00.000Z');
  // The first minute of the next Monday starts a new week.
  assertEquals(week('America/New_York', '2026-10-12T04:00:00Z'), '2026-10-12T04:00:00.000Z');
});

Deno.test('the week holds when clocks go back on Sunday 2026-11-01', () => {
  // Monday Oct 26 began at UTC-4 midnight. Sunday Nov 1 evening (after the change, UTC-5) is still that week.
  assertEquals(week('America/New_York', '2026-11-02T04:30:00Z'), '2026-10-26T04:00:00.000Z');
  // Monday Nov 2 begins at UTC-5 midnight.
  assertEquals(week('America/New_York', '2026-11-02T05:00:00Z'), '2026-11-02T05:00:00.000Z');
});

Deno.test('the week holds when clocks go forward on Sunday 2026-03-08', () => {
  assertEquals(week('America/New_York', '2026-03-09T03:30:00Z'), '2026-03-02T05:00:00.000Z');
  assertEquals(week('America/New_York', '2026-03-09T04:00:00Z'), '2026-03-09T04:00:00.000Z');
});

Deno.test('Tokyo is ahead of UTC: Sunday night UTC is already Monday there', () => {
  // 16:00Z Sunday Oct 11 is 01:00 Monday Oct 12 in Tokyo.
  assertEquals(week('Asia/Tokyo', '2026-10-11T16:00:00Z'), '2026-10-11T15:00:00.000Z');
});

Deno.test('no timezone means the UTC week', () => {
  assertEquals(week(null, '2026-10-10T15:00:00Z'), '2026-10-05T00:00:00.000Z');
  assertEquals(week('Not/AZone', '2026-10-11T23:59:00Z'), '2026-10-05T00:00:00.000Z');
});
