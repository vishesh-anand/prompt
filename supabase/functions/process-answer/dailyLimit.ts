// PRODUCT.md "Limits": at most 10 answers per person per day.
export const dailyLimit = 10;

// The day is the person's own (their saved timezone), but that setting is theirs to change. So the limit also holds over
// any 24 hours, at twice the daily number: changing timezone can't hand out a fresh day's worth of answers again and again.
export function overDailyLimit(answersBeforeToday: number, answersInLast24Hours: number): boolean {
  return answersBeforeToday >= dailyLimit || answersInLast24Hours >= dailyLimit * 2;
}
