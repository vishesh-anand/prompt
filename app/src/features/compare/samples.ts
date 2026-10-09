import { compareAttempts, type Attempt } from './compareAttempts';

// Made-up tries for the design preview (development only), so the before-and-after can be checked without recording anything.
type Band = 'too_slow' | 'good' | 'too_fast' | null;
type Score = 0 | 1 | 2;

function sample(o: { fillers: number; band: Band; mainPoint: Score; reason: Score; ending: Score; durationMs?: number; tip?: string }): Attempt {
  const mark = (score: Score) => ({ score, quotes: ['sample'], why: 'sample' });
  return {
    metrics: {
      wordCount: 120,
      fillers: { total: o.fillers, byWord: {} },
      pace: { wordsPerMinute: o.band === null ? null : 150, band: o.band },
      pauses: { count: 0, longestMs: 0, atSeconds: [] },
      restarts: { count: 0, atSeconds: [] },
    },
    judgement: { mainPoint: mark(o.mainPoint), reasonOrExample: mark(o.reason), ending: mark(o.ending), mainPointAtSeconds: 4 },
    durationMs: o.durationMs ?? 45_000,
    tip: o.tip,
  };
}

const tip = 'Say your main point in your first sentence.';
const before = sample({ fillers: 9, band: 'too_fast', mainPoint: 1, reason: 0, ending: 1 });

export const compareSamples = [
  { name: 'Everything improved', ...compareAttempts(before, sample({ fillers: 4, band: 'good', mainPoint: 2, reason: 1, ending: 2, tip })) },
  { name: 'Mixed', ...compareAttempts(before, sample({ fillers: 5, band: 'too_fast', mainPoint: 1, reason: 0, ending: 0, tip })) },
  { name: 'Nothing improved', ...compareAttempts(before, sample({ fillers: 11, band: 'too_fast', mainPoint: 1, reason: 0, ending: 1, tip })) },
  {
    name: 'Time ran out',
    ...compareAttempts(
      sample({ fillers: 9, band: 'too_fast', mainPoint: 1, reason: 0, ending: 0, durationMs: 60_000 }),
      sample({ fillers: 6, band: 'good', mainPoint: 2, reason: 1, ending: 2, durationMs: 60_000, tip }),
    ),
  },
];
