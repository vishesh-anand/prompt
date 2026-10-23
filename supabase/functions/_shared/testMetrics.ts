import type { Metrics } from './schemas/metrics.ts';

type Changes = Omit<Partial<Metrics>, 'fillers'> & { fillers?: Pick<Metrics['fillers'], 'total' | 'byWord'> };

// Tests only: a measured answer with nothing to notice, with the given parts changed. Fillers a minute follows from
// the filler total and the time spoken.
export function testMetrics({ fillers = { total: 0, byWord: {} }, ...changes }: Changes = {}): Metrics {
  const base = {
    wordCount: 100,
    speakingSeconds: 40,
    pace: { wordsPerMinute: 140, band: 'good' as const },
    pauses: [],
    repeats: { count: 0, atSeconds: [] },
    hedges: { total: 0, byPhrase: {}, atSeconds: [] },
    vagueWords: { total: 0, byWord: {} },
    ands: { count: 0 },
    ...changes,
  };
  const perMinute = base.speakingSeconds > 0 ? (fillers.total / base.speakingSeconds) * 60 : null;
  return { ...base, fillers: { ...fillers, perMinute } };
}
