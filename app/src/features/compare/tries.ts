import type { HistoryRow } from '@/lib/schemas/history';

type AnswerRef = { id: string; retry_of: string | null };

// Which try this is on its question: 1 for a first try, 2 for the first retry, 3 for the next. retry_of always names
// the first attempt (ARCHITECTURE.md), so the retries of one question are the history rows that share it. History is the
// list Home already loads; until it includes this answer, a retry counts as the second try.
export function tryNumber(history: HistoryRow[] | undefined, answer: AnswerRef): number {
  if (answer.retry_of === null) return 1;
  const self = history?.find((row) => row.id === answer.id);
  if (!history || !self) return 2;
  return 1 + history.filter((row) => row.retry_of === answer.retry_of && row.created_at <= self.created_at).length;
}

// Whether this is the person's first retry ever: the practice line on the before-and-after shows only then (DESIGN.md).
// Unknown history counts as not, so the line never shows by mistake to someone who has retried before.
export function isFirstRetry(history: HistoryRow[] | undefined, answer: AnswerRef): boolean {
  if (answer.retry_of === null || !history) return false;
  const retries = history.filter((row) => row.retry_of !== null);
  const earliest = retries.reduce<HistoryRow | null>((a, row) => (a === null || row.created_at < a.created_at ? row : a), null);
  return earliest?.id === answer.id;
}

// The try just before this one on its question, whose tip this retry carried: the first attempt for a second try, the
// previous retry after that. Without history it is the first attempt.
export function previousTry(history: HistoryRow[] | undefined, answer: AnswerRef): string | null {
  if (answer.retry_of === null) return null;
  const self = history?.find((row) => row.id === answer.id);
  if (!history || !self) return answer.retry_of;
  const before = history.filter((row) => row.retry_of === answer.retry_of && row.created_at < self.created_at);
  const latest = before.reduce<HistoryRow | null>((a, row) => (a === null || row.created_at > a.created_at ? row : a), null);
  return latest?.id ?? answer.retry_of;
}

const ordinals = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

// "first try", "second try", "third try" for the top bars.
export function tryLabel(n: number): string {
  return `${ordinals[n - 1] ?? `${n}th`} try`;
}
