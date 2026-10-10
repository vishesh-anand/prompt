// A day is the calendar day on the phone, so "today" means today where you are.
export function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// Stepping by calendar day (not by 24 hours) keeps days with a clock change correct.
function dayBefore(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1, 12);
}

export type Streak = { days: number; practicedToday: boolean };

// Days in a row with at least one answer. The streak is still alive today if you haven't practiced yet but did yesterday.
export function streak(history: { created_at: string }[], now: Date): Streak {
  const practiced = new Set(history.map((answer) => localDayKey(new Date(answer.created_at))));
  const practicedToday = practiced.has(localDayKey(now));
  let day = practicedToday ? now : dayBefore(now);
  let days = 0;
  while (practiced.has(localDayKey(day))) {
    days += 1;
    day = dayBefore(day);
  }
  return { days, practicedToday };
}
