import { localDayKey } from '@/features/streak/streak';

// The week runs Monday to Sunday, in the phone's own day (same rule as the streak). Stepping by calendar day,
// from noon, keeps the weeks with a clock change at 7 days.
export function weekDays(now: Date): Date[] {
  const sinceMonday = (now.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMonday + i, 12));
}

export function weekKeys(now: Date): string[] {
  return weekDays(now).map(localDayKey);
}

// The moment the week began: Monday at midnight on the phone. Answers from here on are this week's.
export function weekStart(now: Date): Date {
  const monday = weekDays(now)[0] as Date;
  return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate());
}
