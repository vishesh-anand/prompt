import { weekKeys, weekStart } from './week';

// The test script pins TZ=America/New_York. Clock changes in 2026: forward on March 8, back on November 1.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

describe('weekKeys', () => {
  it('runs Monday to Sunday', () => {
    expect(weekKeys(at(2026, 10, 10))).toEqual([
      '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11',
    ]);
  });

  it('puts Monday first when today is Monday and last when today is Sunday', () => {
    expect(weekKeys(at(2026, 10, 5))[0]).toBe('2026-10-05');
    expect(weekKeys(at(2026, 10, 11, 23, 59))[0]).toBe('2026-10-05');
    expect(weekKeys(at(2026, 10, 12, 0, 1))[0]).toBe('2026-10-12');
  });

  it('has 7 days in the week clocks go back (Sunday 2026-11-01 has 25 hours)', () => {
    const keys = weekKeys(at(2026, 11, 1, 20));
    expect(keys).toHaveLength(7);
    expect(keys[0]).toBe('2026-10-26');
    expect(keys[6]).toBe('2026-11-01');
  });

  it('has 7 distinct days in the week clocks go forward (Sunday 2026-03-08 has 23 hours)', () => {
    const keys = weekKeys(at(2026, 3, 8, 12));
    expect(new Set(keys).size).toBe(7);
    expect(keys[0]).toBe('2026-03-02');
    expect(keys[6]).toBe('2026-03-08');
  });

  it('crosses a month and a year', () => {
    expect(weekKeys(at(2026, 12, 31))[0]).toBe('2026-12-28');
    expect(weekKeys(at(2026, 12, 31))[6]).toBe('2027-01-03');
  });
});

describe('weekStart', () => {
  it('is Monday at midnight', () => {
    const start = weekStart(at(2026, 10, 10, 15));
    expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours(), start.getMinutes()]).toEqual([2026, 9, 5, 0, 0]);
  });

  it('is the same Monday for any moment in the week', () => {
    expect(weekStart(at(2026, 10, 11, 23, 59)).getTime()).toBe(weekStart(at(2026, 10, 5, 0, 0)).getTime());
  });
});
