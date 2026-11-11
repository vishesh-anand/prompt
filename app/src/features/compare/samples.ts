import { sampleMetrics } from '@/lib/sampleMetrics';
import type { AnswerMap, StepLabel } from '@/lib/schemas/map';

import { compareAttempts, type Attempt, type CompareResult } from './compareAttempts';

// Made-up tries for the design preview (development only), so every state of the before-and-after can be checked without
// recording anything. They are the six states in design-system/compare-e/.
function attempt(o: { steps: [StepLabel, number][]; end: number; offTrackShare?: number; stumbles?: number; tip?: string }): Attempt {
  const steps = o.steps.map(([label, atSeconds], i) => ({ label, atSeconds, sentence: i + 1 }));
  const first = steps.find((s) => s.label === 'direction' || s.label === 'point');
  const map: AnswerMap = {
    version: 8,
    point: { restatement: 'sample' },
    steps,
    pointAtSeconds: first?.atSeconds ?? null,
    offTrackShare: o.offTrackShare ?? 0,
    didntFollow: [],
    restarts: [],
    noticed: [],
  };
  const pauses = Array.from({ length: o.stumbles ?? 0 }, (_, i) => ({ atSeconds: 10 + i * 8, ms: 1800, midSentence: true }));
  return { map, metrics: sampleMetrics({ pauses, speakingSeconds: o.end }), tip: o.tip };
}

const tip = 'Say your point in your first sentence.';
// The first try found its point while talking: off track first, the point at 1:10. A Work question wanted a direct answer.
const foundLate = attempt({ steps: [['off_track', 0], ['support', 20], ['off_track', 40], ['point', 70], ['ending', 100]], end: 108, offTrackShare: 0.4, stumbles: 4, tip });

export type CompareSample = {
  name: string;
  category: 'work' | 'everyday';
  // 2 for a second try, 3 for a third.
  tryNumber: number;
  // The practice line shows on someone's first retry only.
  firstRetry: boolean;
  // null: the first try was scored before this view existed.
  result: CompareResult | null;
};

export const compareSamples: CompareSample[] = [
  {
    name: 'The tip worked',
    category: 'work',
    tryNumber: 2,
    firstRetry: true,
    result: compareAttempts(foundLate, attempt({ steps: [['point', 0], ['support', 12], ['off_track', 40], ['ending', 48]], end: 58, offTrackShare: 0.1, stumbles: 1, tip: 'Finish with one sentence that sums it up.' }), true),
  },
  {
    name: 'Closer, not there yet',
    category: 'work',
    tryNumber: 2,
    firstRetry: false,
    result: compareAttempts(foundLate, attempt({ steps: [['off_track', 0], ['support', 12], ['point', 45], ['ending', 66]], end: 76, offTrackShare: 0.15, stumbles: 1, tip }), true),
  },
  {
    name: 'Not yet, third try',
    category: 'work',
    tryNumber: 3,
    firstRetry: false,
    result: compareAttempts(foundLate, attempt({ steps: [['off_track', 0], ['support', 20], ['off_track', 40], ['point', 72], ['ending', 98]], end: 106, offTrackShare: 0.42, stumbles: 5, tip }), true),
  },
  {
    name: 'First try had no point',
    category: 'everyday',
    tryNumber: 2,
    firstRetry: false,
    result: compareAttempts(
      attempt({ steps: [['off_track', 0], ['support', 30]], end: 70, offTrackShare: 0.5, stumbles: 2, tip: 'Pick the one thing you want them to remember, and say it.' }),
      attempt({ steps: [['direction', 0], ['point', 8], ['ending', 40]], end: 50, stumbles: 0, tip: 'Add one example to back it up.' }),
      false,
    ),
  },
  {
    name: 'Not measured here',
    category: 'everyday',
    tryNumber: 2,
    firstRetry: false,
    result: compareAttempts(
      attempt({ steps: [['point', 0], ['support', 20], ['ending', 60]], end: 70, stumbles: 3, tip: 'Pause instead of saying “um.”' }),
      attempt({ steps: [['point', 0], ['support', 20], ['ending', 55]], end: 62, stumbles: 1, tip: 'Pause instead of saying “um.”' }),
      false,
    ),
  },
  { name: 'First try has no map', category: 'work', tryNumber: 2, firstRetry: false, result: null },
];
