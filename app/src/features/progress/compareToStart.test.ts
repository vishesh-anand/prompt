import { compareToStart, type StartRow } from './compareToStart';

const avg = (fillersPerMinute: number | null, wordsPerMinute: number | null, clearPoint: number | null) => ({ fillersPerMinute, wordsPerMinute, clearPoint });

function rowsOf(start: ReturnType<typeof avg>, week: ReturnType<typeof avg>): StartRow[] {
  const result = compareToStart(start, week);
  if (result.kind !== 'rows') throw new Error('expected rows');
  return result.rows;
}
const row = (rows: StartRow[], id: StartRow['id']) => {
  const found = rows.find((r) => r.id === id);
  if (!found) throw new Error(`no ${id}`);
  return found;
};

describe('filler words', () => {
  it.each([
    { from: 9, to: 5, improved: true, line: '4 fewer filler words a minute' },
    { from: 3, to: 2, improved: true, line: '1 fewer filler word a minute' },
    { from: 4, to: 0, improved: true, line: 'No filler words a minute now' },
    { from: 5, to: 5, improved: false, line: 'Filler words: still 5 a minute' },
    { from: 2, to: 6, improved: false, line: '4 more filler words a minute' },
    { from: 2, to: 3, improved: false, line: '1 more filler word a minute' },
  ])('$from to $to: "$line"', ({ from, to, improved, line }) => {
    const r = row(rowsOf(avg(from, 140, 4), avg(to, 140, 4)), 'fillers');
    expect(r.improved).toBe(improved);
    expect(r.line).toBe(line);
    expect(r.arrow).toBe('down');
  });

  it('rounds before comparing, so 4.6 and 5.4 are both 5 and not a change', () => {
    expect(row(rowsOf(avg(5.4, 140, 4), avg(4.6, 140, 4)), 'fillers').improved).toBe(false);
  });
});

describe('speed', () => {
  it.each([
    { from: 190, to: 150, improved: true, line: 'Speed is now good' },
    { from: 90, to: 130, improved: true, line: 'Speed is now good' },
    { from: 140, to: 150, improved: false, line: 'Speed: still good' },
    { from: 140, to: 185, improved: false, line: 'Speed went from good to too fast' },
    { from: 190, to: 180, improved: false, line: 'Speed: still too fast' },
    { from: 190, to: 90, improved: false, line: 'Speed went from too fast to too slow' },
  ])('$from to $to: "$line"', ({ from, to, improved, line }) => {
    const r = row(rowsOf(avg(4, from, 4), avg(4, to, 4)), 'speed');
    expect(r.improved).toBe(improved);
    expect(r.line).toBe(line);
  });
});

describe('clear point', () => {
  it('is better only when the total went up', () => {
    expect(row(rowsOf(avg(4, 140, 3), avg(4, 140, 5)), 'clearPoint')).toMatchObject({ improved: true, line: 'Clear point: 3 of 6 → 5 of 6' });
    expect(row(rowsOf(avg(4, 140, 4), avg(4, 140, 4)), 'clearPoint')).toMatchObject({ improved: false, line: 'Clear point: still 4 of 6' });
    expect(row(rowsOf(avg(4, 140, 5), avg(4, 140, 3)), 'clearPoint')).toMatchObject({ improved: false, line: 'Clear point: 5 of 6 → 3 of 6' });
  });

  it('shows halves', () => {
    expect(row(rowsOf(avg(4, 140, 3), avg(4, 140, 4.5)), 'clearPoint').after).toBe('4.5 of 6');
  });
});

describe('missing numbers', () => {
  it('leaves out a row when either side has no number', () => {
    const rows = rowsOf(avg(4, null, 3), avg(2, 150, 4));
    expect(rows.map((r) => r.id)).toEqual(['fillers', 'clearPoint']);
  });

  it('is none when nothing can be compared', () => {
    expect(compareToStart(avg(null, null, null), avg(2, 150, 4))).toEqual({ kind: 'none' });
    expect(compareToStart(avg(2, 150, 4), avg(null, null, null))).toEqual({ kind: 'none' });
  });

  it('is improved when any row improved', () => {
    expect(compareToStart(avg(9, 140, 5), avg(4, 140, 3))).toMatchObject({ kind: 'rows', improved: true });
    expect(compareToStart(avg(4, 140, 5), avg(9, 140, 3))).toMatchObject({ kind: 'rows', improved: false });
  });
});

describe('the coach voice (DESIGN.md)', () => {
  const grid = [avg(9, 190, 1), avg(0, 90, 6), avg(3, 140, 3.5), avg(12, 150, 0)];
  it('has no praise, alarm or exclamation marks, short lines, and an arrow only on an improved row', () => {
    for (const start of grid) {
      for (const week of grid) {
        for (const r of rowsOf(start, week)) {
          expect(r.line).not.toMatch(/great|amazing|awesome|oops|!|fail|bad|wrong/i);
          expect(r.line.length).toBeLessThanOrEqual(60);
        }
      }
    }
  });
});
