type AnswerRef = { id: string; retry_of: string | null };
// The retries of one question, oldest first: rows from useTries.
export type RetryRow = { id: string; created_at: string };

// Which try this is on its question: 1 for a first try, 2 for the first retry, 3 for the next. retry_of always names
// the first attempt (ARCHITECTURE.md), so the retries of one question are the rows that share it. An answer the rows
// don't have yet (just saved) is the newest one.
export function tryNumber(retries: RetryRow[] | undefined, answer: AnswerRef): number {
  if (answer.retry_of === null) return 1;
  if (!retries) return 2;
  const at = retries.findIndex((row) => row.id === answer.id);
  return at === -1 ? retries.length + 2 : at + 2;
}

// The try just before this one on its question, whose tip this retry carried: the first attempt for a second try, the
// previous retry after that. Without the rows it is the first attempt.
export function previousTry(retries: RetryRow[] | undefined, answer: AnswerRef): string | null {
  if (answer.retry_of === null) return null;
  if (!retries) return answer.retry_of;
  const at = retries.findIndex((row) => row.id === answer.id);
  const before = at === -1 ? retries : retries.slice(0, at);
  return before.at(-1)?.id ?? answer.retry_of;
}

// Whether this is the person's first retry ever: the practice line on the before-and-after shows only then (DESIGN.md).
// `firstRetryId` is the id of their earliest retry; unknown counts as not, so the line never shows by mistake.
export function isFirstRetry(firstRetryId: string | null | undefined, answer: AnswerRef): boolean {
  return answer.retry_of !== null && firstRetryId === answer.id;
}

const ordinals = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

// "first try", "second try", "third try" for the top bars.
export function tryLabel(n: number): string {
  return `${ordinals[n - 1] ?? `${n}th`} try`;
}
