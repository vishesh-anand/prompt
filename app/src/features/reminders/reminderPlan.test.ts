import { reminderCount, reminderDates } from './reminderPlan';

const eight = { hour: 20, minute: 0 };

describe('reminderDates', () => {
  it('plans the next 30 days, one a day', () => {
    const dates = reminderDates(new Date(2026, 9, 10, 9), eight, false);
    expect(dates).toHaveLength(reminderCount);
    expect(dates[0]).toEqual(new Date(2026, 9, 10, 20, 0));
    expect(dates[1]).toEqual(new Date(2026, 9, 11, 20, 0));
  });

  it('leaves today out once you have practiced', () => {
    const dates = reminderDates(new Date(2026, 9, 10, 9), eight, true);
    expect(dates).toHaveLength(reminderCount);
    expect(dates[0]).toEqual(new Date(2026, 9, 11, 20, 0));
  });

  it('leaves today out when the time has passed', () => {
    const dates = reminderDates(new Date(2026, 9, 10, 21), eight, false);
    expect(dates[0]).toEqual(new Date(2026, 9, 11, 20, 0));
    expect(dates).toHaveLength(reminderCount);
  });

  it('leaves today out when it is exactly the reminder time', () => {
    expect(reminderDates(new Date(2026, 9, 10, 20, 0), eight, false)[0]).toEqual(new Date(2026, 9, 11, 20, 0));
  });

  it('includes today one minute before', () => {
    expect(reminderDates(new Date(2026, 9, 10, 19, 59), eight, false)[0]).toEqual(new Date(2026, 9, 10, 20, 0));
  });

  it('keeps the same clock time across the clocks going back (2026-11-01)', () => {
    const dates = reminderDates(new Date(2026, 9, 30, 9), eight, false);
    const hours = dates.map((d) => [d.getHours(), d.getMinutes()]);
    expect(hours.every(([h, m]) => h === 20 && m === 0)).toBe(true);
    // Between 2026-10-31 and 2026-11-02 the real gap is 49 hours, not 48.
    const gap = dates.find((d) => d.getDate() === 2 && d.getMonth() === 10)!.getTime() - dates.find((d) => d.getDate() === 31 && d.getMonth() === 9)!.getTime();
    expect(gap / 3_600_000).toBe(49);
  });

  it('keeps the same clock time across the clocks going forward (2026-03-08)', () => {
    const dates = reminderDates(new Date(2026, 2, 6, 9), { hour: 7, minute: 30 }, false);
    expect(dates.every((d) => d.getHours() === 7 && d.getMinutes() === 30)).toBe(true);
  });

  it('plans a time just after midnight and a time late at night', () => {
    expect(reminderDates(new Date(2026, 9, 10, 23, 0), { hour: 0, minute: 5 }, false)[0]).toEqual(new Date(2026, 9, 11, 0, 5));
    expect(reminderDates(new Date(2026, 9, 10, 9), { hour: 23, minute: 59 }, false)[0]).toEqual(new Date(2026, 9, 10, 23, 59));
  });
});
