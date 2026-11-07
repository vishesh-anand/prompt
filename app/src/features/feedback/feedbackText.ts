import { clock } from '@/lib/clock';
import type { Coaching } from '@/lib/schemas/coaching';
import type { AnswerMap } from '@/lib/schemas/map';
import type { Metrics } from '@/lib/schemas/metrics';

import { countWord, offTrackBeforeDirection } from './answerShape';

// The written parts of the feedback screen that plain code puts together from the map, the metrics and the coaching.

// ---- How it sounded

// Each line ends with what to do next (DESIGN.md, How the app talks). A pattern brings its own from the map (map prompt
// v9); the other kinds always get the same one.
const nextStep = {
  fillers: 'Try a short pause instead.',
  pause: 'Finish the sentence, then pause.',
  repeat: 'Say it once, then keep going.',
  hedge: 'Say it plainly.',
  restart: 'Pause, then say it once.',
} as const;

// Two restarts or more are worth a line. One is normal speech. Same rule as restartsForTip in tipFocus.ts.
const restartsWorthALine = 2;

// `atSeconds` is from the first spoken word, as on the map; null for a line with no moment (speed).
export type SoundedLine = { atSeconds: number | null; text: string };

export function soundedLines(map: AnswerMap, metrics: Metrics): SoundedLine[] {
  const lines: SoundedLine[] = [
    ...map.noticed.map((n) => ({
      atSeconds: n.atSeconds ?? null,
      text: [n.why.trim(), n.kind === 'pattern' ? (n.nextStep ?? '').trim() : nextStep[n.kind]].filter((t) => t !== '').join(' '),
    })),
    ...(map.restarts.length >= restartsWorthALine
      ? map.restarts.map((r) => ({ atSeconds: r.atSeconds ?? null, text: `You dropped a sentence and began again: "${r.quote}". ${nextStep.restart}` }))
      : []),
  ];
  // Moments in the order they happened; one without a time (an old map) goes after them.
  lines.sort((a, b) => (a.atSeconds ?? Infinity) - (b.atSeconds ?? Infinity));
  const { band, wordsPerMinute } = metrics.pace;
  if (band === 'too_fast' && wordsPerMinute !== null) lines.push({ atSeconds: null, text: `You spoke at ${wordsPerMinute} words a minute, fast for a listener to keep up with. Slow down a little.` });
  if (band === 'too_slow' && wordsPerMinute !== null) lines.push({ atSeconds: null, text: `You spoke at ${wordsPerMinute} words a minute, slow enough to lose a listener. Give it a bit more energy.` });
  return lines;
}

// Under "How it sounded" on the main screen. A clean answer has no row at all.
export function soundedSummary(count: number): string {
  return `${count} moment${count === 1 ? '' : 's'} a listener would notice`;
}

// ---- Shorter and clearer, and Step by step

type BetterSteps = NonNullable<Coaching['betterSteps']>;

const opensWithDirection = (labels: string[]) => labels[0] === 'direction' || labels[0] === 'point';

function compare(map: AnswerMap, better: BetterSteps | undefined) {
  const yours = map.steps.map((s) => s.label as string);
  const theirs = (better ?? []).map((s) => s.label as string);
  return {
    movedToFront: theirs.length > 0 && !opensWithDirection(yours) && opensWithDirection(theirs),
    endsOnPoint: theirs.length > 0 && yours.at(-1) === 'off_track' && theirs.at(-1) !== 'off_track',
  };
}

// The line under the "Shorter and clearer" row.
export function shorterSubtitle(map: AnswerMap | null, better: BetterSteps | undefined): string {
  if (map) {
    const { movedToFront, endsOnPoint } = compare(map, better);
    if (movedToFront) return 'Your answer, with the point moved to the front';
    if (endsOnPoint) return 'Your answer, ending on your point';
  }
  return 'Your answer, shorter and clearer';
}

// The line at the top of the Step by step sheet.
export function stepByStepIntro(map: AnswerMap, better: BetterSteps | undefined): string {
  const { movedToFront, endsOnPoint } = compare(map, better);
  const offTrack = offTrackBeforeDirection(map.steps);
  if (movedToFront && offTrack > 0) return `Yours had ${countWord(offTrack)} off-track step${offTrack === 1 ? '' : 's'} before the point. The shorter version starts with it.`;
  if (movedToFront) return 'The shorter version starts with your point.';
  if (endsOnPoint) return 'Yours went on after the point. The shorter version stops there.';
  return 'Your steps, next to the shorter version’s.';
}

// ---- The tip

// The quoted moment under the tip: "You started with “So I think, well…”" or "At 1:04 you said “And another time…”".
// A quote cut off mid-sentence gets an ellipsis.
export function tipMomentLine(moment: NonNullable<Coaching['moment']>): string {
  const quote = /[.?!…]$/.test(moment.quote.trim()) ? moment.quote.trim() : `${moment.quote.trim()}…`;
  return moment.atSeconds < 1 ? `You started with "${quote}"` : `At ${clock(moment.atSeconds)} you said "${quote}"`;
}
