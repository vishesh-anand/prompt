import type { WeekAnswer } from '@/lib/schemas/progress';

import { answerAverages, daySeries, weekAverages } from './daySeries';

// The test script pins TZ=America/New_York.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);
const now = at(2026, 10, 10, 15); // Saturday. The week is Oct 5 to Oct 11.

type Score = 0 | 1 | 2;
let n = 0;
function answer(
  when: Date,
  o: { retry?: boolean; fillers?: number; wpm?: number | null; words?: number; main?: Score; reason?: Score; ending?: Score; ms?: number; scored?: boolean } = {},
): WeekAnswer {
  const { retry = false, fillers = 6, wpm = 140, words = 100, main = 1, reason = 1, ending = 1, ms = 30_000, scored = true } = o;
  n += 1;
  const mark = (score: Score) => ({ score, quotes: ['x'], why: 'x' });
  return {
    id: `a${n}`,
    retry_of: retry ? 'first' : null,
    created_at: when.toISOString(),
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

const day = (series: ReturnType<typeof daySeries>, key: string) => {
  const found = series.find((d) => d.key === key);
  if (!found) throw new Error(`no ${key}`);
  return found;
};

describe('daySeries', () => {
  it('has the seven days of the week, Monday first, empty when nothing was answered', () => {
    const series = daySeries([], now);
    expect(series.map((d) => d.key)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
    expect(series.every((d) => !d.practiced && d.fillersPerMinute === null && d.wordsPerMinute === null && d.clearPoint === null)).toBe(true);
  });

  it('counts filler words per minute: 6 in 30 seconds is 12', () => {
    expect(day(daySeries([answer(at(2026, 10, 6), { fillers: 6, ms: 30_000 })], now), '2026-10-06').fillersPerMinute).toBe(12);
  });

  it('adds the three marks for a clear point out of 6', () => {
    const d = day(daySeries([answer(at(2026, 10, 6), { main: 2, reason: 1, ending: 2 })], now), '2026-10-06');
    expect(d.clearPoint).toBe(5);
  });

  it('leaves the ending out when the 60 seconds ran out and scales the other two to 6: marks 2 and 1 give 4.5', () => {
    const d = day(daySeries([answer(at(2026, 10, 6), { main: 2, reason: 1, ending: 0, ms: 60_000 })], now), '2026-10-06');
    expect(d.clearPoint).toBe(4.5);
  });

  it('averages several first attempts on one day', () => {
    const series = daySeries(
      [answer(at(2026, 10, 7, 9), { fillers: 10, ms: 60_000, wpm: 120 }), answer(at(2026, 10, 7, 20), { fillers: 2, ms: 60_000, wpm: 160 })],
      now,
    );
    const d = day(series, '2026-10-07');
    expect(d.fillersPerMinute).toBe(6);
    expect(d.wordsPerMinute).toBe(140);
  });

  it('leaves retries out of the lines but still counts the day as practiced', () => {
    const series = daySeries([answer(at(2026, 10, 8), { retry: true, fillers: 0 })], now);
    const d = day(series, '2026-10-08');
    expect(d.practiced).toBe(true);
    expect(d.fillersPerMinute).toBeNull();
    expect(d.clearPoint).toBeNull();
  });

  it('a retry does not change the average of the first attempt', () => {
    const series = daySeries([answer(at(2026, 10, 8, 9), { fillers: 8, ms: 60_000 }), answer(at(2026, 10, 8, 9, 5), { retry: true, fillers: 0, ms: 60_000 })], now);
    expect(day(series, '2026-10-08').fillersPerMinute).toBe(8);
  });

  it('skips a pace that could not be measured and keeps the other lines', () => {
    const d = day(daySeries([answer(at(2026, 10, 6), { wpm: null, fillers: 3, ms: 60_000 })], now), '2026-10-06');
    expect(d.wordsPerMinute).toBeNull();
    expect(d.fillersPerMinute).toBe(3);
  });

  it('leaves out an answer that is still being scored, but the day counts', () => {
    const d = day(daySeries([answer(at(2026, 10, 9), { scored: false })], now), '2026-10-09');
    expect(d).toMatchObject({ practiced: true, fillersPerMinute: null, wordsPerMinute: null, clearPoint: null });
  });

  it('leaves out an answer with no words', () => {
    const d = day(daySeries([answer(at(2026, 10, 9), { words: 0, fillers: 0, wpm: null })], now), '2026-10-09');
    expect(d).toMatchObject({ practiced: true, fillersPerMinute: null, clearPoint: null });
  });

  it('ignores answers from outside the week', () => {
    const series = daySeries([answer(at(2026, 10, 4, 23, 59)), answer(at(2026, 10, 12, 0, 1))], now);
    expect(series.some((d) => d.practiced)).toBe(false);
  });

  it('puts 11:30pm Sunday on Sunday, in the phone\'s day and not UTC', () => {
    const series = daySeries([answer(at(2026, 10, 11, 23, 30))], at(2026, 10, 11, 23, 45));
    expect(day(series, '2026-10-11').practiced).toBe(true);
  });
});

describe('weekAverages and answerAverages', () => {
  it('averages the days that had a value and ignores the empty ones', () => {
    const series = daySeries(
      [answer(at(2026, 10, 5), { fillers: 12, ms: 60_000 }), answer(at(2026, 10, 7), { fillers: 4, ms: 60_000 }), answer(at(2026, 10, 8), { scored: false })],
      now,
    );
    expect(weekAverages(series).fillersPerMinute).toBe(8);
  });

  it('is all null for an empty week', () => {
    expect(weekAverages(daySeries([], now))).toEqual({ fillersPerMinute: null, wordsPerMinute: null, clearPoint: null });
  });

  it('gives one answer the same numbers a day would', () => {
    expect(answerAverages(answer(at(2026, 10, 6), { fillers: 6, ms: 30_000, main: 2, reason: 2, ending: 2, wpm: 150 }))).toEqual({
      fillersPerMinute: 12,
      wordsPerMinute: 150,
      clearPoint: 6,
    });
  });
});
