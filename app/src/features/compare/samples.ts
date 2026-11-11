import { sampleMetrics } from '@/lib/sampleMetrics';
import type { AnswerMap, StepLabel } from '@/lib/schemas/map';

import { compareAttempts, type Attempt } from './compareAttempts';

// Made-up tries for the design preview (development only), so the before-and-after can be checked without recording anything.
function attempt(o: { steps: [StepLabel, number][]; offTrackShare?: number; stumbles?: number; tip?: string }): Attempt {
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
  return { map, metrics: sampleMetrics({ pauses }), tip: o.tip };
}

const tip = 'Say your point in your first sentence.';
// The first try found its point while talking: off track first, the point at 1:10. A Work question wanted a direct answer.
const foundLate = attempt({ steps: [['off_track', 0], ['support', 20], ['off_track', 40], ['point', 70], ['ending', 100]], offTrackShare: 0.4, stumbles: 4 });

export const compareSamples = [
  {
    name: 'Instruction met',
    ...compareAttempts(foundLate, attempt({ steps: [['point', 0], ['support', 20], ['ending', 55]], offTrackShare: 0.1, stumbles: 1, tip }), true),
  },
  {
    name: 'Numbers moved, instruction not met',
    ...compareAttempts(foundLate, attempt({ steps: [['off_track', 0], ['support', 12], ['point', 45], ['ending', 70]], offTrackShare: 0.15, stumbles: 1, tip }), true),
  },
  {
    name: 'Nothing improved',
    ...compareAttempts(foundLate, attempt({ steps: [['off_track', 0], ['support', 20], ['off_track', 40], ['point', 72], ['ending', 100]], offTrackShare: 0.42, stumbles: 5, tip }), true),
  },
  {
    name: 'First try had no point',
    ...compareAttempts(
      attempt({ steps: [['off_track', 0], ['support', 30]], offTrackShare: 0.5, stumbles: 2 }),
      attempt({ steps: [['direction', 0], ['point', 8], ['ending', 40]], stumbles: 0, tip }),
      false,
    ),
  },
  {
    name: 'Tip about something not measured here',
    ...compareAttempts(
      attempt({ steps: [['point', 0], ['support', 20], ['ending', 60]], stumbles: 3 }),
      attempt({ steps: [['point', 0], ['support', 20], ['ending', 55]], stumbles: 1, tip: 'Pause instead of saying “um”.' }),
      false,
    ),
  },
];
