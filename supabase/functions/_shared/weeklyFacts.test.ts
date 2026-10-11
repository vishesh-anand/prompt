import { assertEquals } from 'jsr:@std/assert@1';

import { type AnswerRow, weeklyFacts } from './weeklyFacts.ts';

const mark = (score: number) => ({ score, quotes: ['x'], why: 'x' });
function row(iso: string, o: { retry?: boolean; fillers?: number; ms?: number; wpm?: number | null; main?: number; reason?: number; ending?: number; scored?: boolean; words?: number } = {}): AnswerRow {
  const { retry = false, fillers = 6, ms = 30_000, wpm = 140, main = 1, reason = 1, ending = 1, scored = true, words = 100 } = o;
  return {
    created_at: iso,
    retry_of: retry ? 'first' : null,
    duration_ms: ms,
    metrics: scored
      ? {
          wordCount: words,
          fillers: { total: fillers, byWord: {} },
          pace: { wordsPerMinute: wpm, band: wpm === null ? null : 'good' },
          pauses: { count: 0, longestMs: 0, atSeconds: [] },
          restarts: { count: 0, atSeconds: [] },
        }
      : null,
    judgement: scored && words > 0 ? { mainPoint: mark(main), reasonOrExample: mark(reason), ending: mark(ending), mainPointAtSeconds: 3 } : null,
  };
}

const ny = 'America/New_York';
// Saturday Oct 10 2026. The New York week is Oct 5 to Oct 11.
const now = new Date('2026-10-10T19:00:00Z');

Deno.test('counts practice days in the person\'s own day: 11pm Sunday in New York belongs to that week, not the next', () => {
  // 03:30Z Oct 12 is 11:30pm Sunday Oct 11 in New York.
  const facts = weeklyFacts({ timeZone: ny, now: new Date('2026-10-12T03:45:00Z'), answers: [row('2026-10-12T03:30:00Z')], start: null });
  assertEquals(facts.weekStart, '2026-10-05');
  assertEquals(facts.practiceDays, 1);
  assertEquals(facts.days[0]?.day, '2026-10-11');
});

Deno.test('leaves out answers from before the week', () => {
  const facts = weeklyFacts({ timeZone: ny, now, answers: [row('2026-10-05T03:59:00Z'), row('2026-10-06T15:00:00Z')], start: null });
  assertEquals(facts.practiceDays, 1);
});

Deno.test('applies the same rules as the phone: per minute, first attempts only, scaled when time ran out', () => {
  const facts = weeklyFacts({
    timeZone: ny,
    now,
    answers: [
      row('2026-10-06T15:00:00Z', { fillers: 6, ms: 30_000 }), // 12 a minute, clear point 3
      row('2026-10-06T15:10:00Z', { retry: true, fillers: 0 }), // a retry, left out of the numbers
      row('2026-10-07T15:00:00Z', { fillers: 4, ms: 60_000, main: 2, reason: 1, ending: 0 }), // time ran out: 4.5
    ],
    start: null,
  });
  assertEquals(facts.days.map((d) => d.fillersPerMinute), [12, 4]);
  assertEquals(facts.days.map((d) => d.clearPoint), [3, 4.5]);
  // Days are 12 and 4 fillers a minute, and clear point 3 and 4.5: the average of 3.75 is shown as 4.
  assertEquals(facts.average, { fillersPerMinute: 8, wordsPerMinute: 140, clearPoint: 4 });
});

Deno.test('a day with only a retry or an unscored answer still counts as practice', () => {
  const facts = weeklyFacts({ timeZone: ny, now, answers: [row('2026-10-06T15:00:00Z', { retry: true }), row('2026-10-07T15:00:00Z', { scored: false })], start: null });
  assertEquals(facts.practiceDays, 2);
  assertEquals(facts.days.map((d) => d.fillersPerMinute), [null, null]);
});

Deno.test('the starting point is included when it was scored and null when it was not', () => {
  const scored = weeklyFacts({ timeZone: ny, now, answers: [], start: row('2026-09-01T15:00:00Z', { fillers: 15, ms: 60_000 }) });
  assertEquals(scored.start, { fillersPerMinute: 15, wordsPerMinute: 140, clearPoint: 3 });
  const unscored = weeklyFacts({ timeZone: ny, now, answers: [], start: row('2026-09-01T15:00:00Z', { scored: false }) });
  assertEquals(unscored.start, null);
  const none = weeklyFacts({ timeZone: ny, now, answers: [], start: null });
  assertEquals(none.start, null);
});

Deno.test('carries nothing but numbers and dates', () => {
  const facts = weeklyFacts({ timeZone: ny, now, answers: [row('2026-10-06T15:00:00Z')], start: null });
  const text = JSON.stringify(facts);
  assertEquals(/quotes|why|transcript/.test(text), false);
});

Deno.test('numbers are whole (or halves for the clear point), never long decimals', () => {
  const facts = weeklyFacts({
    timeZone: ny,
    now,
    answers: [row('2026-10-06T15:00:00Z', { fillers: 17, ms: 30_100, wpm: 118 }), row('2026-10-06T16:00:00Z', { fillers: 1, ms: 45_000, wpm: 131 })],
    start: null,
  });
  for (const d of facts.days) {
    assertEquals(d.fillersPerMinute, Math.round(d.fillersPerMinute as number));
    assertEquals(d.wordsPerMinute, Math.round(d.wordsPerMinute as number));
    assertEquals((d.clearPoint as number) * 2, Math.round((d.clearPoint as number) * 2));
  }
});

Deno.test('scoredDays counts only days that have a scored first attempt', () => {
  const facts = weeklyFacts({
    timeZone: ny,
    now,
    answers: [
      row('2026-10-05T15:00:00Z'), // scored
      row('2026-10-06T15:00:00Z', { scored: false }), // still being processed
      row('2026-10-07T15:00:00Z', { retry: true }), // only a retry
      row('2026-10-08T15:00:00Z', { words: 0, fillers: 0, wpm: null }), // no words
    ],
    start: null,
  });
  assertEquals(facts.practiceDays, 4);
  assertEquals(facts.scoredDays, 1);
});

Deno.test('a day that is measured but not yet judged is not scored: the note waits for its clear point', () => {
  const measuredOnly: AnswerRow = { ...row('2026-10-06T15:00:00Z'), judgement: null };
  const facts = weeklyFacts({ timeZone: ny, now, answers: [measuredOnly], start: null });
  assertEquals(facts.practiceDays, 1);
  assertEquals(facts.scoredDays, 0);
  assertEquals(facts.days[0]?.fillersPerMinute, 12);
});
