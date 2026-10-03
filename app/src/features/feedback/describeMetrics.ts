import type { Metrics } from '@/lib/schemas/metrics';

const speedWords = { too_slow: 'Too slow', good: 'Good', too_fast: 'Too fast' } as const;

// The words and numbers the feedback screen shows for the measured part of an answer.
export function describeMetrics(metrics: Metrics) {
  const { fillers, pace } = metrics;

  // Most-said first: "um 4 · like 3 · so 1". Empty when there were none.
  const fillerList = Object.entries(fillers.byWord)
    .sort(([, a], [, b]) => b - a)
    .map(([word, times]) => `${word} ${times}`)
    .join(' · ');

  return {
    fillerCount: fillers.total === 0 ? 'None' : String(fillers.total),
    fillerList,
    speed: pace.band ? speedWords[pace.band] : '—',
    speedDetail: pace.wordsPerMinute === null ? 'Too few words to measure your speed.' : `${pace.wordsPerMinute} words a minute`,
  };
}
