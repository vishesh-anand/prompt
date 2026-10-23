// Source of truth: PRODUCT.md "The daily practice". Answers under 10 seconds are not scored.
// The database checks the same numbers (migration 20261023000000_answer_time_limit.sql).
export const firstTryMs = 120_000;
export const retryMs = 90_000;
export const minAnswerMs = 10_000;

// A retry is a little tighter than the first try.
export function limitFor(retryOf: string | null): number {
  return retryOf === null ? firstTryMs : retryMs;
}

// For VoiceOver: "Up to 2 minutes", "Up to 90 seconds".
export function limitHint(limitMs: number): string {
  const seconds = Math.round(limitMs / 1000);
  if (seconds === 60) return 'Up to 1 minute';
  return seconds % 60 === 0 ? `Up to ${seconds / 60} minutes` : `Up to ${seconds} seconds`;
}

// Did the time limit stop this answer? Each answer stores the limit it was recorded with (time_limit_ms; 60 seconds
// before step B). A little slack for the recorder's last few milliseconds.
// Same rule as stoppedByTimeLimit in supabase/functions/_shared/pipeline/judge.ts.
export function stoppedByTimeLimit(durationMs: number, timeLimitMs: number): boolean {
  return durationMs >= timeLimitMs - 500;
}
