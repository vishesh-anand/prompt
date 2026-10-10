import { dateToTime, defaultReminder, formatTime, parseTime, timeToDate } from './timeOfDay';

describe('timeOfDay', () => {
  it('reads a Postgres time', () => {
    expect(parseTime('20:00:00')).toEqual({ hour: 20, minute: 0 });
    expect(parseTime('07:45:00')).toEqual({ hour: 7, minute: 45 });
    expect(parseTime('00:05')).toEqual({ hour: 0, minute: 5 });
  });

  it('falls back to 8pm for null, empty or nonsense', () => {
    for (const bad of [null, '', 'soon', '25:00:00', '12:75:00']) expect(parseTime(bad)).toEqual(defaultReminder);
    expect(defaultReminder).toEqual({ hour: 20, minute: 0 });
  });

  it('round-trips through the database format and the picker', () => {
    for (const time of [{ hour: 0, minute: 0 }, { hour: 8, minute: 5 }, { hour: 20, minute: 0 }, { hour: 23, minute: 59 }]) {
      expect(parseTime(formatTime(time))).toEqual(time);
      expect(dateToTime(timeToDate(time))).toEqual(time);
    }
    expect(formatTime({ hour: 8, minute: 5 })).toBe('08:05:00');
  });
});
