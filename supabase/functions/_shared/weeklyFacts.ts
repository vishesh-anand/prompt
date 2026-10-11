import { dayKeyIn, weekStartIn } from './dayStart.ts';
import { stoppedByTimeLimit } from './pipeline/judge.ts';
import { savedJudgementSchema } from './schemas/judgement.ts';
import { metricsSchema } from './schemas/metrics.ts';

// Plain code, no AI. The numbers the weekly note is written from. The same rules as the phone's chart
// (app/src/features/progress/daySeries.ts): first attempts only, filler words per minute, the three marks out of 6
// with the ending left out when the 60 seconds ran out. Every answer still counts as a practice day.

export type AnswerRow = { created_at: string; retry_of: string | null; duration_ms: number; metrics: unknown; judgement: unknown };

export type Numbers = { fillersPerMinute: number | null; wordsPerMinute: number | null; clearPoint: number | null };

export type WeeklyFacts = {
  weekStart: string;
  practiceDays: number;
  // Of those, the days with at least one first attempt that has been through the judge (so it has a clear point). A note is only written from these, so a
  // day whose answers are still being processed doesn't make a note that can't see them (and is then never redone).
  scoredDays: number;
  // The days that had a first attempt that could be scored, in order.
  days: ({ day: string } & Numbers)[];
  average: Numbers;
  // The first recording's numbers, or null when it has none to compare.
  start: Numbers | null;
};

const mean = (values: number[]): number | null => (values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length);
// Whole numbers for counts and speed, halves for the clear point: the same precision the phone shows, so the note
// never quotes "33.9 a minute" or "118.2 words a minute".
const whole = (v: number | null): number | null => (v === null ? null : Math.round(v));
const half = (v: number | null): number | null => (v === null ? null : Math.round(v * 2) / 2);

export function numbersOf(row: AnswerRow): Numbers {
  const metrics = metricsSchema.safeParse(row.metrics);
  const measured = metrics.success && metrics.data.wordCount > 0 ? metrics.data : null;
  const judgement = savedJudgementSchema.safeParse(row.judgement);
  let clearPoint: number | null = null;
  if (measured && judgement.success) {
    const { mainPoint, reasonOrExample, ending } = judgement.data;
    clearPoint = stoppedByTimeLimit(row.duration_ms)
      ? ((mainPoint.score + reasonOrExample.score) / 4) * 6
      : mainPoint.score + reasonOrExample.score + ending.score;
  }
  return {
    fillersPerMinute: measured && row.duration_ms > 0 ? measured.fillers.total / (row.duration_ms / 60_000) : null,
    wordsPerMinute: measured?.pace.wordsPerMinute ?? null,
    clearPoint,
  };
}

function averageOf(list: Numbers[]): Numbers {
  const of = (pick: (n: Numbers) => number | null) => mean(list.map(pick).filter((v): v is number => v !== null));
  return { fillersPerMinute: of((n) => n.fillersPerMinute), wordsPerMinute: of((n) => n.wordsPerMinute), clearPoint: of((n) => n.clearPoint) };
}

const hasAny = (n: Numbers) => n.fillersPerMinute !== null || n.wordsPerMinute !== null || n.clearPoint !== null;

const round = (n: Numbers): Numbers => ({
  fillersPerMinute: whole(n.fillersPerMinute),
  wordsPerMinute: whole(n.wordsPerMinute),
  clearPoint: half(n.clearPoint),
});

// `answers` are the ones from the start of the week on. `start` is the starting-point recording, if it has been scored.
export function weeklyFacts({ timeZone, now, answers, start }: { timeZone: string | null; now: Date; answers: AnswerRow[]; start: AnswerRow | null }): WeeklyFacts {
  const weekStart = weekStartIn(timeZone, now);
  const inWeek = answers.filter((a) => Date.parse(a.created_at) >= weekStart.getTime());
  const byDay = new Map<string, AnswerRow[]>();
  for (const a of inWeek) {
    const key = dayKeyIn(timeZone, new Date(a.created_at));
    byDay.set(key, [...(byDay.get(key) ?? []), a]);
  }
  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, rows]) => ({ day, ...round(averageOf(rows.filter((r) => r.retry_of === null).map(numbersOf))) }));
  const startNumbers = start ? round(numbersOf(start)) : null;
  return {
    weekStart: dayKeyIn(timeZone, weekStart),
    practiceDays: byDay.size,
    scoredDays: days.filter((d) => d.clearPoint !== null).length,
    days,
    average: round(averageOf(days)),
    start: startNumbers && hasAny(startNumbers) ? startNumbers : null,
  };
}
