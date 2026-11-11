import { pointArrival } from '@/features/feedback/answerShape';
import { clock } from '@/lib/clock';
import type { AnswerMap } from '@/lib/schemas/map';
import type { Metrics } from '@/lib/schemas/metrics';

// The before-and-after, in words (DESIGN.md, "Before and after"). Plain code, no AI: every word comes from the two saved
// maps, the counted pauses and the tips.

// One try. `tip` is the tip that try's feedback gave: the first try's is the one being checked, the latest try's is the
// next step when it didn't work.
export type Attempt = { map: AnswerMap; metrics: Metrics; tip?: string };

// Did the retry do what the first try's tip asked? `notMeasured`: the tip was about something this screen doesn't
// compare (how it sounded, speed, the ending).
export type Status = 'worked' | 'closer' | 'notYet' | 'notMeasured';

// How a row moved. `littleWorse` is the wrong way by less than noise: never "Same" for a rise.
export type Trend = 'better' | 'same' | 'littleWorse' | 'worse';

export type CompareRow = {
  id: 'point' | 'offTrack' | 'stumbles';
  trend: Trend;
  // "Better", "Sooner", "Same", "A little later", "Later", "A little more", "More".
  word: string;
  // Green only when the improvement isn't the tip's own unmet target, and the tip was measured here, so green never
  // looks like credit for the tip.
  credited: boolean;
  // The one fact, said once: "Off track: 40% to 15%."
  fact: string;
};

export type CompareResult = {
  // "Your tip: …": the first try's tip, the one being checked.
  tip: string | null;
  status: Status;
  // The instruction check, one sentence.
  check: string;
  rows: CompareRow[];
  // When the tip wasn't met: the latest try's tip as the one next step. "Same tip, one more try" when it repeats.
  nextTip: { heading: string; tip: string } | null;
};

// A point that starts later than this (from the first spoken word) came late.
// Same rule as latePointSeconds in supabase/functions/_shared/pipeline/transcriptText.ts.
const latePointSeconds = 15;
// An answer with at least this share of its time off track gets a tip about it. Same rule as offTrackShareForTip in tipFocus.ts.
const offTrackShareForTip = 0.25;
// A change smaller than this is noise, not progress (DESIGN.md): 5 seconds for the point, 5 percentage points for off
// track, 1 for stumbles.
export const noise = { pointSeconds: 5, offTrackPoints: 5, stumbles: 1 } as const;

export type TipKind = 'no_point' | 'found_late' | 'direct_late' | 'off_track' | 'other';

// Which focus the first try's tip was about, read again from the first try's map. The server doesn't save the focus,
// and the rules below only need the map and whether the question wanted a direct answer. Same order as chooseFocus in
// supabase/functions/_shared/pipeline/tipFocus.ts (version 6): the point first, then a late direct answer, then off-track
// time. Anything after those (ending, how it sounded, speed) is `other`.
export function tipKind(map: AnswerMap, wantsDirectAnswer: boolean): TipKind {
  const arrival = pointArrival(map);
  if (arrival === 'none') return 'no_point';
  if (arrival === 'found_late') return 'found_late';
  const point = pointStep(map);
  if (wantsDirectAnswer && point !== undefined && point.atSeconds > latePointSeconds) return 'direct_late';
  if (map.offTrackShare >= offTrackShareForTip) return 'off_track';
  return 'other';
}

const pointStep = (map: AnswerMap) => map.steps.find((s) => s.label === 'point');
const percent = (map: AnswerMap) => Math.round(map.offTrackShare * 100);
// Pauses in the middle of a sentence. Between sentences they sound like thinking and are not counted (PRODUCT.md).
const stumbles = (metrics: Metrics) => metrics.pauses.filter((p) => p.midSentence).length;

// A row's trend from how much it fell (positive: fewer, sooner) against its noise. A rise by less than noise, or by
// exactly 1 stumble, is "a little".
function trendOf(fall: number, noiseSize: number): Trend {
  if (fall >= noiseSize) return 'better';
  if (fall >= 0) return 'same';
  return -fall > noiseSize ? 'worse' : 'littleWorse';
}

// Point times are compared in whole seconds, as they are shown.
type PointAt = { seconds: number; firstSentence: boolean } | null;
const pointAt = (map: AnswerMap): PointAt => {
  const p = pointStep(map);
  return p === undefined ? null : { seconds: Math.round(p.atSeconds), firstSentence: p.sentence === 1 };
};
const said = (p: NonNullable<PointAt>) => (p.firstSentence ? 'your first sentence' : clock(p.seconds));

function pointTrend(was: PointAt, now: PointAt): Trend {
  if (was === null) return now === null ? 'same' : 'better';
  if (now === null) return 'worse';
  return trendOf(was.seconds - now.seconds, noise.pointSeconds);
}

function pointFact(was: PointAt, now: PointAt): string {
  if (was === null && now === null) return 'Point: none both times.';
  if (was === null && now !== null) return `Point: none last time, ${clock(now.seconds)} now.`;
  if (was !== null && now === null) return `Point: ${clock(was.seconds)} last time, none now.`;
  if (was === null || now === null) return '';
  if (was.firstSentence && now.firstSentence) return 'Point: at the start both times.';
  if (said(was) === said(now)) return `Point: ${said(now)} both times.`;
  return `Point: ${said(was)} to ${said(now)}.`;
}

const words = {
  point: { better: 'Better', sooner: 'Sooner', littleWorse: 'A little later', worse: 'Later' },
  amount: { better: 'Better', sooner: 'Better', littleWorse: 'A little more', worse: 'More' },
} as const;

function row(id: CompareRow['id'], trend: Trend, credited: boolean, fact: string): CompareRow {
  const w = id === 'point' ? words.point : words.amount;
  const word = trend === 'better' ? (credited ? w.better : w.sooner) : trend === 'same' ? 'Same' : w[trend];
  return { id, trend, word, credited: trend === 'better' && credited, fact };
}

// The instruction, checked: whether it worked, and the one sentence that says what happened. Never blames.
function check(kind: TipKind, first: Attempt, latest: Attempt): { status: Status; check: string } {
  const was = pointAt(first.map);
  const now = pointAt(latest.map);

  if (kind === 'other') {
    return { status: 'notMeasured', check: 'This screen compares your point, off-track time and stumbles, not this tip. Listen back to hear how it went.' };
  }

  if (kind === 'no_point') {
    return now === null
      ? { status: 'notYet', check: 'A listener still couldn’t find one main point.' }
      : { status: 'worked', check: 'A listener found your point this time.' };
  }

  if (kind === 'off_track') {
    const before = percent(first.map);
    const after = percent(latest.map);
    if (latest.map.offTrackShare < offTrackShareForTip && before - after >= noise.offTrackPoints) {
      return { status: 'worked', check: `You cut the off-track time from ${before}% to ${after}%.` };
    }
    if (before - after >= noise.offTrackPoints) {
      return { status: 'closer', check: `Off-track time fell from ${before}% to ${after}%, but it’s still more than a quarter of your answer.` };
    }
    return { status: 'notYet', check: `Off-track time was ${before}% on your first try and ${after}% on this one.` };
  }

  // found_late and direct_late: the listener should know early where you're going. For a direct answer the point
  // itself must come early.
  const latestPoint = pointStep(latest.map);
  const met = pointArrival(latest.map) === 'early' && (kind === 'found_late' || (latestPoint !== undefined && latestPoint.atSeconds <= latePointSeconds));
  if (met) {
    const opener = latest.map.steps.find((s) => s.label === 'direction' || s.label === 'point');
    if (opener === undefined || opener.sentence === 1) return { status: 'worked', check: 'You told the listener where you were going in your first sentence.' };
    return { status: 'worked', check: `You told the listener where you were going by ${clock(opener.atSeconds)}.` };
  }
  if (now === null) return { status: 'notYet', check: 'A listener couldn’t find one main point this time.' };
  if (was !== null && was.seconds - now.seconds >= noise.pointSeconds) {
    return { status: 'closer', check: `Your point came ${was.seconds - now.seconds} seconds sooner, at ${clock(now.seconds)}, but not in your first sentence.` };
  }
  if (was !== null && now.seconds > was.seconds + noise.pointSeconds) {
    return { status: 'notYet', check: `Your point came at ${clock(now.seconds)}, later than on your first try.` };
  }
  return { status: 'notYet', check: `Your point came at ${clock(now.seconds)}, about when it came on your first try.` };
}

// Which row the tip was about. Its improvement isn't green when the tip wasn't met: the status already says "Closer".
const tipRow: Record<TipKind, CompareRow['id'] | null> = {
  no_point: 'point',
  found_late: 'point',
  direct_late: 'point',
  off_track: 'offTrack',
  other: null,
};

export function compareAttempts(first: Attempt, latest: Attempt, wantsDirectAnswer: boolean): CompareResult {
  const kind = tipKind(first.map, wantsDirectAnswer);
  const { status, check: sentence } = check(kind, first, latest);
  const credited = (id: CompareRow['id']) => status !== 'notMeasured' && !(tipRow[kind] === id && status !== 'worked');

  const wasPoint = pointAt(first.map);
  const nowPoint = pointAt(latest.map);
  const wasOff = percent(first.map);
  const nowOff = percent(latest.map);
  const wasStumbles = stumbles(first.metrics);
  const nowStumbles = stumbles(latest.metrics);

  const rows = [
    row('point', pointTrend(wasPoint, nowPoint), credited('point'), pointFact(wasPoint, nowPoint)),
    row('offTrack', trendOf(wasOff - nowOff, noise.offTrackPoints), credited('offTrack'), wasOff === nowOff ? `Off track: ${nowOff}% both times.` : `Off track: ${wasOff}% to ${nowOff}%.`),
    row(
      'stumbles',
      trendOf(wasStumbles - nowStumbles, noise.stumbles),
      credited('stumbles'),
      wasStumbles === nowStumbles ? `Stumbles: ${nowStumbles} both times.` : `Stumbles: ${wasStumbles} to ${nowStumbles}.`,
    ),
  ];

  const showNext = (status === 'closer' || status === 'notYet') && latest.tip !== undefined && latest.tip.trim() !== '';
  const same = latest.tip?.trim() === first.tip?.trim();
  const nextTip = showNext && latest.tip ? { heading: same ? 'Same tip, one more try' : 'One thing to try next', tip: latest.tip } : null;

  return { tip: first.tip ?? null, status, check: sentence, rows, nextTip };
}
