import { pointArrival } from '@/features/feedback/answerShape';
import { clock } from '@/lib/clock';
import type { AnswerMap } from '@/lib/schemas/map';
import type { Metrics } from '@/lib/schemas/metrics';

// What the before-and-after needs from one try. The tip is the one the try ended with: it becomes the next step when
// nothing improved.
export type Attempt = { map: AnswerMap; metrics: Metrics; tip?: string };

export type CompareRow = {
  id: 'point' | 'offTrack' | 'stumbles';
  label: string;
  // What each attempt shows on screen.
  before: string;
  after: string;
  // Rows that are whole numbers: the screen counts them up or down into place.
  count?: { before: number; after: number; unit: '%' | '' };
  improved: boolean;
  // Which way the arrow points when the row improved. Fewer is down; a point that came sooner is down too.
  arrow: 'up' | 'down';
  // One plain sentence about this row, whether or not it improved.
  line: string;
};

export type Summary = { improved: true } | { improved: false; message: string; nextStep: string | null };

// What the first try's tip asked for, and whether the retry did it. `met: null` means the tip was about something this
// screen doesn't measure (how it sounded, speed, a missing ending), so only the numbers are shown.
export type InstructionCheck = { met: boolean | null; line: string | null };

// A point that starts later than this (from the first spoken word) came late.
// Same rule as latePointSeconds in supabase/functions/_shared/pipeline/transcriptText.ts.
const latePointSeconds = 15;
// An answer with at least this share of its time off track gets a tip about it. Same rule as offTrackShareForTip in tipFocus.ts.
const offTrackShareForTip = 0.25;
// A change smaller than this is noise, not progress: 5 seconds sooner, 5 percentage points less off track.
const meaningfulPointGainSeconds = 5;
const meaningfulOffTrackGain = 5;

export type TipKind = 'no_point' | 'found_late' | 'direct_late' | 'off_track' | 'other';

// Which of the tip's focuses the first try's tip was about, read again from the first try's map. The server doesn't save
// the focus, and the rules below only need the map and whether the question wanted a direct answer. Same order as
// chooseFocus in supabase/functions/_shared/pipeline/tipFocus.ts (version 6): the point first, then a late direct answer,
// then off-track time. Anything after those (ending, how it sounded, speed) is `other`.
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

function pointRow(first: Attempt, latest: Attempt): CompareRow {
  const was = pointStep(first.map)?.atSeconds ?? null;
  const now = pointStep(latest.map)?.atSeconds ?? null;
  const shown = (seconds: number | null) => (seconds === null ? 'No point' : clock(seconds));
  const foundOne = was === null && now !== null;
  const sooner = was !== null && now !== null && was - now >= meaningfulPointGainSeconds;
  let line: string;
  if (foundOne) line = 'A listener found your point this time.';
  else if (sooner) line = `Your point came at ${clock(now)}, not ${clock(was)}.`;
  else if (was === null && now === null) line = 'A listener couldn’t find a main point either time.';
  else if (was !== null && now === null) line = 'A listener couldn’t find a main point this time.';
  else if (was !== null && now !== null && now - was >= meaningfulPointGainSeconds) line = `Your point came later this time, at ${clock(now)}.`;
  else line = `Your point came at about the same time: ${shown(now)}.`;
  return { id: 'point', label: 'Point', before: shown(was), after: shown(now), improved: foundOne || sooner, arrow: 'down', line };
}

function offTrackRow(first: Attempt, latest: Attempt): CompareRow {
  const was = percent(first.map);
  const now = percent(latest.map);
  const better = was - now >= meaningfulOffTrackGain;
  let line: string;
  if (better) line = `Off track: ${was}% to ${now}%.`;
  else if (now - was >= meaningfulOffTrackGain) line = `Off track went up, from ${was}% to ${now}%.`;
  else line = `Off track is about the same: ${now}%.`;
  return { id: 'offTrack', label: 'Off track', before: `${was}%`, after: `${now}%`, count: { before: was, after: now, unit: '%' }, improved: better, arrow: 'down', line };
}

function stumblesRow(first: Attempt, latest: Attempt): CompareRow {
  const was = stumbles(first.metrics);
  const now = stumbles(latest.metrics);
  let line: string;
  if (now < was) line = now === 0 ? 'No stumbles this time.' : `Stumbles: ${was} to ${now}.`;
  else if (now > was) line = `More stumbles this time: ${was} to ${now}.`;
  else line = now === 0 ? 'No stumbles either time.' : `Still ${now} ${now === 1 ? 'stumble' : 'stumbles'}.`;
  return { id: 'stumbles', label: 'Stumbles', before: String(was), after: String(now), count: { before: was, after: now, unit: '' }, improved: now < was, arrow: 'down', line };
}

// The instruction, checked first. Plain code, from the tip's focus kind and the two maps; no AI.
export function checkInstruction(kind: TipKind, first: Attempt, latest: Attempt): InstructionCheck {
  const was = pointStep(first.map)?.atSeconds ?? null;
  const now = pointStep(latest.map);

  if (kind === 'no_point') {
    return pointArrival(latest.map) === 'none'
      ? { met: false, line: 'A listener still couldn’t find one main point.' }
      : { met: true, line: 'A listener found your point this time.' };
  }

  if (kind === 'found_late' || kind === 'direct_late') {
    const early = pointArrival(latest.map) === 'early' && (kind === 'found_late' || (now !== undefined && now.atSeconds <= latePointSeconds));
    const lastTime = was === null ? '' : ` Last time, your point came at ${clock(was)}.`;
    if (early) {
      const opener = latest.map.steps.find((s) => s.label === 'direction' || s.label === 'point');
      const where = opener !== undefined && opener.sentence === 1 ? 'in your first sentence' : `by ${clock(opener?.atSeconds ?? 0)}`;
      return { met: true, line: `You told the listener where you were going ${where}.${lastTime}` };
    }
    const when = now === undefined ? 'A listener couldn’t find one main point.' : `Your point came at ${clock(now.atSeconds)}, so the listener still waited for it.`;
    return { met: false, line: `${when}${lastTime}` };
  }

  if (kind === 'off_track') {
    const before = percent(first.map);
    const after = percent(latest.map);
    return latest.map.offTrackShare < offTrackShareForTip && before - after >= meaningfulOffTrackGain
      ? { met: true, line: `You cut the off-track time from ${before}% to ${after}%.` }
      : { met: false, line: `Off track was ${before}% last time and ${after}% this time.` };
  }

  return { met: null, line: null };
}

// Puts the first try and the latest try side by side. Plain code, no AI: every word comes from the saved map and numbers.
export function compareAttempts(first: Attempt, latest: Attempt, wantsDirectAnswer: boolean): { instruction: InstructionCheck; rows: CompareRow[]; summary: Summary } {
  const instruction = checkInstruction(tipKind(first.map, wantsDirectAnswer), first, latest);
  const rows = [pointRow(first, latest), offTrackRow(first, latest), stumblesRow(first, latest)];

  // When the tip asked for something we can check, "improved" means it did that. Otherwise any row that got better counts.
  const improved = instruction.met ?? rows.some((r) => r.improved);
  if (improved) return { instruction, rows, summary: { improved: true } };

  // Nothing got better. Say plainly whether anything changed at all, then give the retry's own tip as the one next step.
  // A row can still have improved when the tip's own check said no: say that, so the green row and the message agree.
  const changed = rows.some((r) => r.before !== r.after);
  const message = rows.some((r) => r.improved) ? 'Some numbers moved, but not what this tip asked for.' : changed ? 'Nothing improved this time.' : 'No change this time.';
  return { instruction, rows, summary: { improved: false, message, nextStep: latest.tip ?? null } };
}
