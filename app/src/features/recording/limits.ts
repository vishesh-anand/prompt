// Source of truth: PRODUCT.md "Recording". Answers under 10 seconds are not scored.
export const maxAnswerMs = 60_000;
export const minAnswerMs = 10_000;

// Did the 60-second limit stop this answer? A little slack for the recorder's last few milliseconds.
// Same rule as stoppedByTimeLimit in supabase/functions/_shared/pipeline/judge.ts.
export function stoppedByTimeLimit(durationMs: number): boolean {
  return durationMs >= maxAnswerMs - 500;
}
