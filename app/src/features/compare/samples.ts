import { sampleMetrics } from '@/lib/sampleMetrics';
import type { AnswerMap, StepLabel } from '@/lib/schemas/map';

import { compareAttempts, type Attempt } from './compareAttempts';
import type { CompareData, TryView } from './CompareView';

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

const view = (a: Attempt): TryView => ({ map: a.map, speakingSeconds: a.metrics.speakingSeconds, durationSeconds: a.metrics.speakingSeconds + 3 });

function sample(name: string, o: Omit<CompareData, 'tries'> & { first: Attempt; latest: Attempt | null; wantsDirectAnswer?: boolean }) {
  const { first, latest, wantsDirectAnswer = false, ...rest } = o;
  const tries = latest === null ? null : { first: view(first), latest: view(latest), result: compareAttempts(first, latest, wantsDirectAnswer) };
  return { name, data: { ...rest, tries } satisfies CompareData };
}

export const compareSamples = [
  sample('The tip worked', {
    category: 'work',
    tryNumber: 2,
    firstRetry: true,
    wantsDirectAnswer: true,
    first: foundLate,
    latest: attempt({ steps: [['point', 0], ['support', 12], ['off_track', 40], ['ending', 48]], end: 58, offTrackShare: 0.1, stumbles: 1, tip: 'Finish with one sentence that sums it up.' }),
  }),
  sample('Closer, not there yet', {
    category: 'work',
    tryNumber: 2,
    firstRetry: false,
    wantsDirectAnswer: true,
    first: foundLate,
    latest: attempt({ steps: [['off_track', 0], ['support', 12], ['point', 45], ['ending', 66]], end: 76, offTrackShare: 0.15, stumbles: 1, tip }),
  }),
  sample('Not yet, third try', {
    category: 'work',
    tryNumber: 3,
    firstRetry: false,
    wantsDirectAnswer: true,
    first: foundLate,
    latest: attempt({ steps: [['off_track', 0], ['support', 20], ['off_track', 40], ['point', 72], ['ending', 98]], end: 106, offTrackShare: 0.42, stumbles: 5, tip }),
  }),
  sample('First try had no point', {
    category: 'everyday',
    tryNumber: 2,
    firstRetry: false,
    first: attempt({ steps: [['off_track', 0], ['support', 30]], end: 70, offTrackShare: 0.5, stumbles: 2, tip: 'Pick the one thing you want them to remember, and say it.' }),
    latest: attempt({ steps: [['direction', 0], ['point', 8], ['ending', 40]], end: 50, stumbles: 0, tip: 'Add one example to back it up.' }),
  }),
  sample('Not measured here', {
    category: 'everyday',
    tryNumber: 2,
    firstRetry: false,
    first: attempt({ steps: [['point', 0], ['support', 20], ['ending', 60]], end: 70, stumbles: 3, tip: 'Pause instead of saying “um.”' }),
    latest: attempt({ steps: [['point', 0], ['support', 20], ['ending', 55]], end: 62, stumbles: 1, tip: 'Pause instead of saying “um.”' }),
  }),
  sample('First try has no map', { category: 'work', tryNumber: 2, firstRetry: false, first: foundLate, latest: null }),
];
