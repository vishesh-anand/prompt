import * as Notifications from 'expo-notifications';
import { z } from 'zod';

// Coach voice (DESIGN.md): plain, no hype.
export const reminderContent = { title: "Today's question is waiting", body: 'One minute, out loud.' };

// Changes to the phone's schedule happen one after another. Without this, two calls close together (setup finishing while
// the app comes to the front) could each cancel and then both schedule, leaving every reminder twice.
let queue: Promise<unknown> = Promise.resolve();

// Resolves true once the phone holds exactly this plan, false if it could not be scheduled (notifications are off).
export function scheduleReminders(dates: Date[]): Promise<boolean> {
  const run = queue.then(() => apply(dates));
  queue = run.catch(() => {});
  return run;
}

async function apply(dates: Date[]): Promise<boolean> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (dates.length === 0) return true;
  // Asking happens once, in first-time setup. If you said no there, nothing is scheduled.
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return false;
  for (const date of dates) {
    await Notifications.scheduleNotificationAsync({
      content: reminderContent,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
    });
  }
  return true;
}

// Asks once, from first-time setup. Saying no is fine: the app works without reminders.
export async function askForReminderPermission(): Promise<boolean> {
  const { granted } = await Notifications.requestPermissionsAsync();
  return granted;
}

// For the development screen: a reminder 10 seconds from now, to check that notifications reach this phone.
export async function sendTestReminder(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: reminderContent,
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 10 },
  });
}

// For the development screen: 'granted', 'denied' or 'undetermined'.
export async function notificationStatus(): Promise<string> {
  return (await Notifications.getPermissionsAsync()).status;
}

// What iOS reports for a reminder set with a date: the seconds left until it fires, counted from the moment you ask
// (seen on a real run: {"type":"timeInterval","repeats":false,"seconds":102950.6}). A calendar trigger is read too, in case
// a future version reports it that way.
const triggerSchema = z.union([
  z.object({ type: z.literal('timeInterval'), seconds: z.number() }),
  z.object({
    type: z.literal('calendar'),
    dateComponents: z.object({ year: z.number(), month: z.number(), day: z.number(), hour: z.number(), minute: z.number() }),
  }),
]);

export function triggerDate(trigger: unknown, now: Date): Date | null {
  const parsed = triggerSchema.safeParse(trigger);
  if (!parsed.success) return null;
  if (parsed.data.type === 'timeInterval') return new Date(now.getTime() + parsed.data.seconds * 1000);
  const { year, month, day, hour, minute } = parsed.data.dateComponents;
  return new Date(year, month - 1, day, hour, minute);
}

// For the development screen and the scripted checks: when the phone will remind you next.
export async function scheduledReminderDates(): Promise<Date[]> {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  const now = new Date();
  return pending
    .flatMap(({ trigger }) => triggerDate(trigger, now) ?? [])
    .sort((a, b) => a.getTime() - b.getTime());
}
