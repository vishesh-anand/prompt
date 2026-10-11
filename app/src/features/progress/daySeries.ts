import { stoppedByTimeLimit } from '@/features/recording/limits';
import { localDayKey } from '@/features/streak/streak';
import type { WeekAnswer } from '@/lib/schemas/progress';

import { weekKeys } from './week';

// One day of the chart. A value is null when nothing that day could be scored for it.
export type DayPoint = {
  key: string;
  practiced: boolean;
  fillersPerMinute: number | null;
  wordsPerMinute: number | null;
  // The three marks added up, out of 6.
  clearPoint: number | null;
};

export type Averages = Pick<DayPoint, 'fillersPerMinute' | 'wordsPerMinute' | 'clearPoint'>;

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;
}

function oneAnswer(a: WeekAnswer): Averages {
  const measured = a.metrics !== null && a.metrics.wordCount > 0 ? a.metrics : null;
  let clearPoint: number | null = null;
  if (a.judgement !== null && measured !== null) {
    const { mainPoint, reasonOrExample, ending } = a.judgement;
    // When the 60 seconds ran out nobody chose the ending, so it's left out and the other two marks fill the 6
    // (the same rule as the feedback and before-and-after screens).
    clearPoint = stoppedByTimeLimit(a.duration_ms)
      ? ((mainPoint.score + reasonOrExample.score) / 4) * 6
      : mainPoint.score + reasonOrExample.score + ending.score;
  }
  return {
    // Per minute, because answers run from 10 to 60 seconds and a bare count would just track how long you spoke.
    fillersPerMinute: measured !== null && a.duration_ms > 0 ? measured.fillers.total / (a.duration_ms / 60_000) : null,
    wordsPerMinute: measured?.pace.wordsPerMinute ?? null,
    clearPoint,
  };
}

// This week's seven days. Only first attempts shape the lines: a retry comes straight after reading the better version,
// so it would make the week look better than you really speak. Every answer still counts as a practice day, like the streak.
export function daySeries(answers: WeekAnswer[], now: Date): DayPoint[] {
  return weekKeys(now).map((key) => {
    const today = answers.filter((a) => localDayKey(new Date(a.created_at)) === key);
    const scored = today.filter((a) => a.retry_of === null).map(oneAnswer);
    const values = (pick: (v: Averages) => number | null) => scored.map(pick).filter((v): v is number => v !== null);
    return {
      key,
      practiced: today.length > 0,
      fillersPerMinute: mean(values((v) => v.fillersPerMinute)),
      wordsPerMinute: mean(values((v) => v.wordsPerMinute)),
      clearPoint: mean(values((v) => v.clearPoint)),
    };
  });
}

// The same numbers for one answer, for the starting point.
export function answerAverages(answer: WeekAnswer): Averages {
  return oneAnswer(answer);
}

// The week as one set of numbers: the average of the days that had a value.
export function weekAverages(series: DayPoint[]): Averages {
  const of = (pick: (d: DayPoint) => number | null) => mean(series.map(pick).filter((v): v is number => v !== null));
  return {
    fillersPerMinute: of((d) => d.fillersPerMinute),
    wordsPerMinute: of((d) => d.wordsPerMinute),
    clearPoint: of((d) => d.clearPoint),
  };
}
