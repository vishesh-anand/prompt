import type { TimeOfDay } from './timeOfDay';

// iOS keeps at most 64 scheduled notifications. A month ahead is plenty: the plan is rebuilt every time the app opens.
export const reminderCount = 30;

// The next reminder times, one a day at your chosen time. Today's is left out if you already practiced or the time
// has passed. Built from the calendar date and clock time (not by adding 24 hours), so 8pm stays 8pm across a clock change.
export function reminderDates(now: Date, time: TimeOfDay, practicedToday: boolean): Date[] {
  const dates: Date[] = [];
  for (let offset = 0; dates.length < reminderCount; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, time.hour, time.minute, 0, 0);
    if (offset === 0 && (practicedToday || date.getTime() <= now.getTime())) continue;
    dates.push(date);
  }
  return dates;
}
