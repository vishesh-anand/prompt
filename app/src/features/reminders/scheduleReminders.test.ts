import * as Notifications from 'expo-notifications';

import { reminderContent, scheduleReminders, triggerDate } from './scheduleReminders';

// A tiny in-memory phone: what is scheduled right now, with a little delay so overlapping calls can interleave.
jest.mock('expo-notifications', () => {
  const state = { scheduled: [] as { content: unknown; trigger: { date: Date } }[], granted: true };
  const wait = () => new Promise((r) => setTimeout(r, 1));
  return {
    __state: state,
    SchedulableTriggerInputTypes: { DATE: 'date' },
    cancelAllScheduledNotificationsAsync: jest.fn(async () => {
      await wait();
      state.scheduled = [];
    }),
    getPermissionsAsync: jest.fn(async () => ({ granted: state.granted })),
    scheduleNotificationAsync: jest.fn(async (request: { content: unknown; trigger: { date: Date } }) => {
      await wait();
      state.scheduled.push(request);
      return 'id';
    }),
  };
});

const phone = (Notifications as unknown as { __state: { scheduled: { content: unknown; trigger: { type: string; date: Date } }[]; granted: boolean } }).__state;
const days = (...ns: number[]) => ns.map((n) => new Date(2026, 9, n, 20, 0));

beforeEach(() => {
  phone.scheduled = [];
  phone.granted = true;
  jest.clearAllMocks();
});

describe('scheduleReminders', () => {
  it('schedules each date once, as a one-off date reminder with the coach-voice text', async () => {
    await scheduleReminders(days(10, 11, 12));
    expect(phone.scheduled.map((s) => s.trigger.date)).toEqual(days(10, 11, 12));
    expect(phone.scheduled.every((s) => s.trigger.type === 'date')).toBe(true);
    expect(phone.scheduled.every((s) => s.content === reminderContent)).toBe(true);
  });

  it('clears the old reminders first, so rescheduling never doubles up', async () => {
    await scheduleReminders(days(10, 11));
    await scheduleReminders(days(11, 12));
    expect(phone.scheduled.map((s) => s.trigger.date)).toEqual(days(11, 12));
  });

  it('two calls at once end with exactly the second plan', async () => {
    await Promise.all([scheduleReminders(days(10, 11, 12)), scheduleReminders(days(20, 21))]);
    expect(phone.scheduled.map((s) => s.trigger.date)).toEqual(days(20, 21));
  });

  it('an empty plan (practiced, nothing left today) clears everything', async () => {
    await scheduleReminders(days(10, 11));
    await scheduleReminders([]);
    expect(phone.scheduled).toEqual([]);
  });

  it('schedules nothing if you said no to notifications, but still clears old ones', async () => {
    await scheduleReminders(days(10));
    phone.granted = false;
    await scheduleReminders(days(11, 12));
    expect(phone.scheduled).toEqual([]);
  });

  it('a failed call does not block the next one', async () => {
    (Notifications.cancelAllScheduledNotificationsAsync as jest.Mock).mockRejectedValueOnce(new Error('nope'));
    await expect(scheduleReminders(days(10))).rejects.toThrow('nope');
    await scheduleReminders(days(11));
    expect(phone.scheduled.map((s) => s.trigger.date)).toEqual(days(11));
  });
});

describe('triggerDate', () => {
  const now = new Date(2026, 9, 10, 15, 24, 10);

  it('reads the shape iOS really reports: seconds from now', () => {
    // From the real run: a reminder 28h 35m 50s away is tomorrow at 8pm.
    const real = { type: 'timeInterval', repeats: false, class: 'UNTimeIntervalNotificationTrigger', dateComponents: null, seconds: 102950.6135289669 };
    const date = triggerDate(real, now);
    expect(date?.getDate()).toBe(11);
    expect(date?.getHours()).toBe(20);
    expect(date?.getMinutes()).toBe(0);
  });

  it('also reads a calendar trigger', () => {
    const calendar = { type: 'calendar', repeats: false, dateComponents: { year: 2026, month: 10, day: 11, hour: 20, minute: 0 } };
    expect(triggerDate(calendar, now)).toEqual(new Date(2026, 9, 11, 20, 0));
  });

  it('ignores anything else', () => {
    expect(triggerDate(null, now)).toBeNull();
    expect(triggerDate({ type: 'push' }, now)).toBeNull();
    expect(triggerDate({ type: 'timeInterval' }, now)).toBeNull();
  });
});
