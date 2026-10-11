import { chartRows, chartSummary } from './chartRows';
import type { DayPoint } from './daySeries';

const empty = (key: string): DayPoint => ({ key, practiced: false, fillersPerMinute: null, wordsPerMinute: null, clearPoint: null });
const week = (patch: Record<number, Partial<DayPoint>>) => ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((k, i) => ({ ...empty(k), ...patch[i] }));

describe('chartSummary', () => {
  it('names the days that have a value, row by row', () => {
    const series = week({ 0: { practiced: true, fillersPerMinute: 12, wordsPerMinute: 150, clearPoint: 3 }, 2: { practiced: true, fillersPerMinute: 8.4, wordsPerMinute: 140, clearPoint: 4.5 } });
    expect(chartSummary(series, null)).toBe(
      'Filler words: Monday 12 a minute, Wednesday 8 a minute. Speed: Monday 150 words a minute, Wednesday 140 words a minute. Clear point: Monday 3 of 6, Wednesday 4.5 of 6',
    );
  });

  it('says nothing is scored for an empty row, and mentions the starting point when there is one', () => {
    const text = chartSummary(week({}), { fillersPerMinute: 10, wordsPerMinute: null, clearPoint: 2 });
    expect(text).toContain('Filler words: nothing scored yet');
    expect(text).toContain('Speed: nothing scored yet');
  });

  it('adds the starting point after the days', () => {
    const series = week({ 1: { practiced: true, fillersPerMinute: 5 } });
    expect(chartSummary(series, { fillersPerMinute: 10, wordsPerMinute: null, clearPoint: null })).toContain('Filler words: Tuesday 5 a minute. Your starting point was 10 a minute');
  });
});

describe('chartRows', () => {
  it('has the three rows in the order PRODUCT.md lists them', () => {
    expect(chartRows.map((r) => r.id)).toEqual(['fillers', 'speed', 'clearPoint']);
  });
});
