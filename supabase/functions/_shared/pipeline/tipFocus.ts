import type { SavedJudgement } from '../schemas/judgement.ts';
import type { Metrics } from '../schemas/metrics.ts';
import { latePointSeconds } from './judge.ts';

// Plain code, no AI: which single thing the tip is about. Claude only writes the tip about this focus.
// Bump this when any rule below changes, and save it in pipeline_version.
export const tipFocusVersion = 4;

export type FocusKind = 'main_point' | 'ending' | 'reason_or_example' | 'fillers' | 'speed' | 'polish';

// `facts` are the real numbers and the person's own words the coach may cite. `judgeNote` is the judge's one-line
// reason for the mark, so the tip can be about what was actually wrong (late, split, vague) and not just the number.
export type Focus = { kind: FocusKind; facts: Record<string, unknown> };

type Input = { metrics: Metrics; judgement: SavedJudgement; stoppedByTimeLimit: boolean };

// Fillers per 100 words said, and how many make it severe, moderate or mild. First guesses, to tune on real answers
// the way the speed bands in measure.ts were.
export const fillerBands = { severe: 8, moderate: 5, mild: 3 } as const;

// Highest severity wins. On a tie the one earlier in this list wins. Reason or example is last: it is the judge's
// least reliable mark (evals/results/judge.md), so it only drives the tip when nothing else is worth a tip.
const order: FocusKind[] = ['main_point', 'ending', 'fillers', 'speed', 'reason_or_example'];

export function fillersPer100Words(metrics: Metrics): number {
  return metrics.wordCount === 0 ? 0 : (metrics.fillers.total / metrics.wordCount) * 100;
}

export function chooseFocus({ metrics, judgement, stoppedByTimeLimit }: Input): Focus {
  const candidates: { kind: FocusKind; severity: number; facts: Record<string, unknown> }[] = [];
  const add = (kind: FocusKind, severity: number, facts: Record<string, unknown>) => {
    if (severity > 0) candidates.push({ kind, severity, facts });
  };

  const { mainPoint, reasonOrExample, ending } = judgement;
  add('main_point', mainPoint.score === 0 ? 3 : mainPoint.score === 1 ? 2 : 0, {
    quote: mainPoint.quotes[0],
    judgeNote: mainPoint.why,
    startsAtSeconds: judgement.mainPointAtSeconds,
    cameLate: judgement.mainPointAtSeconds > latePointSeconds,
  });

  // The time limit stopped the answer, so a missing ending isn't something the person can fix by talking differently.
  if (!stoppedByTimeLimit) add('ending', ending.score === 0 ? 3 : ending.score === 1 ? 2 : 0, { lastWords: ending.quotes[0], judgeNote: ending.why });

  // The least reliable of the three marks, so it ranks below everything else: even the mildest problem elsewhere
  // (severity 1) beats it. A missing reason (0.5 more than a general one) is still a tip when nothing else is flagged.
  add('reason_or_example', reasonOrExample.score === 0 ? 1 : reasonOrExample.score === 1 ? 0.5 : 0, { quote: reasonOrExample.quotes[0], judgeNote: reasonOrExample.why });

  const rate = fillersPer100Words(metrics);
  const topFillers = Object.entries(metrics.fillers.byWord)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([word, times]) => ({ word, times }));
  add('fillers', rate >= fillerBands.severe ? 3 : rate >= fillerBands.moderate ? 2 : rate >= fillerBands.mild ? 1 : 0, {
    total: metrics.fillers.total,
    per100Words: Math.round(rate * 10) / 10,
    mostSaid: topFillers,
  });

  const { band, wordsPerMinute } = metrics.pace;
  add('speed', band === 'too_fast' || band === 'too_slow' ? 2 : 0, { band, wordsPerMinute });

  // Repeats ("I think, I think") are counted but never the tip: listeners take them in about as fast as fluent speech.

  candidates.sort((a, b) => b.severity - a.severity || order.indexOf(a.kind) - order.indexOf(b.kind));
  const best = candidates[0];
  return best ? { kind: best.kind, facts: best.facts } : { kind: 'polish', facts: { fillersTotal: metrics.fillers.total } };
}
