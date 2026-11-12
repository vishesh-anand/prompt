import { clock } from '@/lib/clock';
import type { AnswerMap, StepLabel } from '@/lib/schemas/map';

// How the answer was built, in words, from the map's steps: the headline, the answer line and its spoken summary.
// Plain code, no AI, so answers mapped before step D2 get them too.

type Steps = AnswerMap['steps'];

// A point that starts later than this (from the first spoken word) came late.
// Same rule as latePointSeconds in supabase/functions/_shared/pipeline/transcriptText.ts.
export const latePointSeconds = 15;

export type PointArrival = 'none' | 'early' | 'found_late' | 'chosen_late';

// How the point arrived. Same rule as pointArrival in supabase/functions/_shared/pipeline/tipFocus.ts: no point step;
// early (the listener knew where it was going within 15 seconds); late and found while talking (off track before the
// first Direction or Point); late and chosen (a frame or a build-up first).
export function pointArrival({ steps, pointAtSeconds }: Pick<AnswerMap, 'steps' | 'pointAtSeconds'>): PointArrival {
  if (!steps.some((s) => s.label === 'point') || pointAtSeconds === null) return 'none';
  if (pointAtSeconds <= latePointSeconds) return 'early';
  return offTrackBeforeDirection(steps) > 0 ? 'found_late' : 'chosen_late';
}

// How many off-track steps came before the listener knew where the answer was going.
export function offTrackBeforeDirection(steps: Steps): number {
  const first = steps.findIndex((s) => s.label === 'direction' || s.label === 'point');
  return steps.slice(0, first === -1 ? steps.length : first).filter((s) => s.label === 'off_track').length;
}

const numberWords = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
export const countWord = (n: number) => numberWords[n] ?? String(n);

const pointStep = (steps: Steps) => steps.find((s) => s.label === 'point');

// The one line under the question.
export function headline(map: Pick<AnswerMap, 'steps' | 'pointAtSeconds'>): string {
  const { steps } = map;
  const point = pointStep(steps);
  const arrival = pointArrival(map);
  if (arrival === 'none' || !point) return 'A listener couldn’t find one main point here.';
  const at = clock(point.atSeconds);
  if (arrival === 'found_late') {
    const n = offTrackBeforeDirection(steps);
    return `You found your point while talking, after ${countWord(n)} off-track step${n === 1 ? '' : 's'}.`;
  }
  const first = steps.find((s) => s.label === 'direction' || s.label === 'point');
  if (arrival === 'chosen_late') {
    return first?.label === 'direction' ? `You said where you were going, then made your point at ${at}.` : `You set up a story, then made your point at ${at}.`;
  }
  // Early: the listener knew where it was going within 15 seconds. A frame first and a later point says both.
  if (first?.label === 'direction' && point.atSeconds > latePointSeconds) return `You said where you were going, then made your point at ${at}.`;
  if (first?.label === 'direction') {
    return first.sentence === 1 ? 'You told the listener where you were going in your first sentence.' : `You told the listener where you were going at ${clock(first.atSeconds)}.`;
  }
  return point.sentence === 1 ? 'You made your point in your first sentence.' : `You made your point at ${at}.`;
}

export const labelName: Record<StepLabel, string> = {
  direction: 'Direction',
  point: 'Point',
  support: 'Support',
  off_track: 'Off track',
  ending: 'Ending',
};

// How each step is drawn on the answer line (DESIGN.md): off track solid grey, the point solid dark, the rest outlined.
export type SegmentStyle = 'offTrack' | 'point' | 'outline';
export type Segment = { label: StepLabel; share: number; style: SegmentStyle };

// One segment per step, its width the share of the time spoken. The last step runs to the last word.
export function segments(steps: Steps, speakingSeconds: number): Segment[] {
  const end = Math.max(speakingSeconds, steps.at(-1)?.atSeconds ?? 0);
  const lengths = steps.map((s, i) => Math.max(0, (steps[i + 1]?.atSeconds ?? end) - s.atSeconds));
  const total = lengths.reduce((a, n) => a + n, 0);
  return steps.map((s, i) => ({
    label: s.label,
    // An answer of one instant (or all steps at one time) still draws: equal shares.
    share: total > 0 ? (lengths[i] ?? 0) / total : 1 / steps.length,
    style: s.label === 'off_track' ? 'offTrack' : s.label === 'point' ? 'point' : 'outline',
  }));
}

// The steps in words under the line: "Off track → Support → Point at 1:10 → Ending". The point part is drawn semibold.
// When the timer stopped an answer that has no ending, it ends "Time ran out" instead (ARCHITECTURE.md).
export type StepWord = { text: string; isPoint: boolean };

export function stepWords(steps: Steps, timeRanOut: boolean): StepWord[] {
  const words = steps.map((s) => ({ text: s.label === 'point' ? `Point at ${clock(s.atSeconds)}` : labelName[s.label], isPoint: s.label === 'point' }));
  return timeRanOut && !steps.some((s) => s.label === 'ending') ? [...words, { text: 'Time ran out', isPoint: false }] : words;
}

const afterPoint: Record<StepLabel, string> = {
  direction: 'a signpost',
  point: 'your point',
  support: 'support',
  off_track: 'an off-track step',
  ending: 'an ending',
};

// What VoiceOver reads for the whole answer line: "Off track, support, off track, then your point at 1:10, then an
// ending." (DESIGN.md, Accessibility).
export function spokenShape(steps: Steps, timeRanOut: boolean): string {
  const at = steps.findIndex((s) => s.label === 'point');
  const ranOut = timeRanOut && !steps.some((s) => s.label === 'ending') ? ', then time ran out' : '';
  if (at === -1) return `${steps.map((s) => labelName[s.label].toLowerCase()).join(', ')}, and no clear point${ranOut}.`.replace(/^./, (c) => c.toUpperCase());
  const before = steps.slice(0, at).map((s) => labelName[s.label].toLowerCase());
  const point = `your point at ${clock(steps[at]?.atSeconds ?? 0)}`;
  const after = steps.slice(at + 1).map((s) => `then ${afterPoint[s.label]}`);
  const parts = before.length > 0 ? [...before, `then ${point}`, ...after] : [point, ...after];
  return `${parts.join(', ')}${ranOut}.`.replace(/^./, (c) => c.toUpperCase());
}
