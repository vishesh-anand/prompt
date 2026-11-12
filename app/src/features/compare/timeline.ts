import { segments, type Segment } from '@/features/feedback/answerShape';
import { firstTryMs } from '@/features/recording/limits';
import type { AnswerMap } from '@/lib/schemas/map';

// Both tries' answer lines share one time scale, 0:00 to 2:00 (the first try's limit), so a shorter answer is visibly
// shorter (DESIGN.md, Before and after). Each line's width is its speaking time over the scale; inside it, the segments
// are the feedback screen's, by share of the time.
export const scaleSeconds = firstTryMs / 1000;

export type Timeline = {
  // The line's width, as a share of the scale (0 to 1).
  width: number;
  segments: Segment[];
  // Where the point starts, as a share of the scale; null when there is no point step.
  pointAt: { share: number; seconds: number } | null;
};

const clampShare = (seconds: number) => Math.min(1, Math.max(0, seconds / scaleSeconds));

export function timeline(map: AnswerMap, speakingSeconds: number): Timeline {
  const end = Math.max(speakingSeconds, map.steps.at(-1)?.atSeconds ?? 0);
  const point = map.steps.find((s) => s.label === 'point');
  return {
    width: clampShare(end),
    segments: segments(map.steps, speakingSeconds),
    pointAt: point === undefined ? null : { share: clampShare(point.atSeconds), seconds: point.atSeconds },
  };
}
