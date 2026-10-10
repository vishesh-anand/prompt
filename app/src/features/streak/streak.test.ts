import { localDayKey, streak } from './streak';

// The test script pins TZ=America/New_York. Clock changes in 2026: forward on March 8, back on November 1.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);
const answered = (...dates: Date[]) => dates.map((d) => ({ created_at: d.toISOString() }));

describe('the test setup', () => {
  // If this fails, the timezone is no longer pinned and the clock-change cases below prove nothing.
  it('runs in New York, where clocks change on 2026-11-01', () => {
    expect(new Date(2026, 10, 1, 12).getTimezoneOffset()).toBe(300);
    expect(new Date(2026, 9, 31, 12).getTimezoneOffset()).toBe(240);
  });
});

describe('localDayKey', () => {
  it('uses the phone\'s day, not UTC', () => {
    // 11pm on Oct 10 in New York is already Oct 11 in UTC.
    expect(localDayKey(at(2026, 10, 10, 23, 30))).toBe('2026-10-10');
    expect(localDayKey(new Date('2026-10-11T03:30:00Z'))).toBe('2026-10-10');
  });
});

describe('streak', () => {
  const now = at(2026, 10, 10, 15);

  it('is 0 with no answers', () => {
    expect(streak([], now)).toEqual({ days: 0, practicedToday: false });
  });

  it('is 1 after answering today', () => {
    expect(streak(answered(at(2026, 10, 10, 9)), now)).toEqual({ days: 1, practicedToday: true });
  });

  it('is still alive today if you practiced yesterday but not yet today', () => {
    expect(streak(answered(at(2026, 10, 9, 20)), now)).toEqual({ days: 1, practicedToday: false });
  });

  it('counts yesterday and today as 2', () => {
    expect(streak(answered(at(2026, 10, 9), at(2026, 10, 10, 9)), now)).toEqual({ days: 2, practicedToday: true });
  });

  it('resets after a missed day', () => {
    expect(streak(answered(at(2026, 10, 7), at(2026, 10, 8)), now)).toEqual({ days: 0, practicedToday: false });
    expect(streak(answered(at(2026, 10, 7), at(2026, 10, 8), at(2026, 10, 10, 9)), now)).toEqual({ days: 1, practicedToday: true });
  });

  it('several answers on one day count once', () => {
    expect(streak(answered(at(2026, 10, 10, 8), at(2026, 10, 10, 9), at(2026, 10, 10, 10)), now).days).toBe(1);
  });

  it('11:59pm one day and 12:01am the next are two days', () => {
    const history = answered(at(2026, 10, 9, 23, 59), at(2026, 10, 10, 0, 1));
    expect(streak(history, now).days).toBe(2);
  });

  it('answers do not need to be in order', () => {
    expect(streak(answered(at(2026, 10, 10), at(2026, 10, 8), at(2026, 10, 9)), now).days).toBe(3);
  });

  it('keeps counting across the day clocks go back (2026-11-01 has 25 hours)', () => {
    const history = answered(at(2026, 10, 31, 20), at(2026, 11, 1, 20), at(2026, 11, 2, 20));
    expect(streak(history, at(2026, 11, 2, 21)).days).toBe(3);
  });

  it('keeps counting across the day clocks go forward (2026-03-08 has 23 hours)', () => {
    const history = answered(at(2026, 3, 7, 0, 30), at(2026, 3, 8, 23, 30), at(2026, 3, 9, 0, 30));
    expect(streak(history, at(2026, 3, 9, 12)).days).toBe(3);
  });

  it('a long streak does not end early', () => {
    const history = answered(...Array.from({ length: 40 }, (_, i) => at(2026, 10, 10 - i)));
    expect(streak(history, now).days).toBe(40);
  });
});
