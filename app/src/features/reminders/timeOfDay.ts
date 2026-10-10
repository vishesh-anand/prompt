export type TimeOfDay = { hour: number; minute: number };

export const defaultReminder: TimeOfDay = { hour: 20, minute: 0 };

// Postgres `time` columns arrive as "20:00:00". Null means first-time setup hasn't happened.
export function parseTime(value: string | null): TimeOfDay {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? '');
  if (!match) return defaultReminder;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? { hour, minute } : defaultReminder;
}

export function formatTime({ hour, minute }: TimeOfDay): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

// The picker works in Dates; only the hour and minute matter.
export function timeToDate({ hour, minute }: TimeOfDay, on: Date = new Date()): Date {
  return new Date(on.getFullYear(), on.getMonth(), on.getDate(), hour, minute, 0, 0);
}

export function dateToTime(date: Date): TimeOfDay {
  return { hour: date.getHours(), minute: date.getMinutes() };
}
