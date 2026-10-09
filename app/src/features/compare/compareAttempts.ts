import { describeJudgement } from '@/features/feedback/describeJudgement';
import { describeMetrics } from '@/features/feedback/describeMetrics';
import { stoppedByTimeLimit } from '@/features/recording/limits';
import type { Judgement } from '@/lib/schemas/judgement';
import type { Metrics } from '@/lib/schemas/metrics';

export type Attempt = { metrics: Metrics; judgement: Judgement; durationMs: number; tip?: string };

export type CompareRow = {
  id: 'fillers' | 'speed' | 'mainPoint' | 'reasonOrExample' | 'ending';
  label: string;
  // What each attempt shows on screen.
  before: string;
  after: string;
  // Only the filler row: the screen counts these numbers up or down into place.
  count?: { before: number; after: number };
  improved: boolean;
  // Which way the arrow points when the row improved. Fewer filler words is down; everything else is up.
  arrow: 'up' | 'down';
  // One plain sentence about this row, whether or not it improved.
  line: string;
};

export type Summary = { improved: true } | { improved: false; message: string; nextStep: string | null };

const speedLine = {
  too_slow: 'too slow',
  good: 'good',
  too_fast: 'too fast',
} as const;

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function fillerRow(first: Attempt, latest: Attempt): CompareRow {
  const before = first.metrics.fillers.total;
  const after = latest.metrics.fillers.total;
  let line: string;
  if (after < before) line = after === 0 ? 'No filler words this time' : `${before - after} fewer filler ${before - after === 1 ? 'word' : 'words'}`;
  else if (after > before) line = `${after - before} more filler ${after - before === 1 ? 'word' : 'words'}`;
  else line = after === 0 ? 'No filler words either time' : `Still ${plural(after, 'filler word')}`;
  return { id: 'fillers', label: 'Filler words', before: String(before), after: String(after), count: { before, after }, improved: after < before, arrow: 'down', line };
}

function speedRow(first: Attempt, latest: Attempt): CompareRow {
  const before = first.metrics.pace.band;
  const after = latest.metrics.pace.band;
  const shown = (m: Metrics) => describeMetrics(m).speed;
  let line: string;
  if (before === null || after === null) line = 'Not enough words to measure speed';
  else if (before !== 'good' && after === 'good') line = 'Speed is now good';
  else if (before === 'good' && after === 'good') line = 'Speed stayed good';
  else if (before === after) line = `Speed is still ${speedLine[after]}`;
  else line = `Speed went from ${speedLine[before]} to ${speedLine[after]}`;
  return {
    id: 'speed',
    label: 'Speed',
    before: shown(first.metrics),
    after: shown(latest.metrics),
    improved: before !== null && before !== 'good' && after === 'good',
    arrow: 'up',
    line,
  };
}

// The three marks of a clear point. The ending is left out of the comparison when the 60 seconds ran out
// on either try: nobody chose where that answer stopped, so a better or worse ending means nothing.
function markRows(first: Attempt, latest: Attempt): CompareRow[] {
  const firstRanOut = stoppedByTimeLimit(first.durationMs);
  const latestRanOut = stoppedByTimeLimit(latest.durationMs);
  const before = describeJudgement(first.judgement, { stoppedByTimeLimit: firstRanOut });
  const after = describeJudgement(latest.judgement, { stoppedByTimeLimit: latestRanOut });
  const scores = [
    ['mainPoint', first.judgement.mainPoint.score, latest.judgement.mainPoint.score],
    ['reasonOrExample', first.judgement.reasonOrExample.score, latest.judgement.reasonOrExample.score],
    ['ending', first.judgement.ending.score, latest.judgement.ending.score],
  ] as const;

  return scores.map(([id, was, now], i): CompareRow => {
    const b = before[i];
    const a = after[i];
    if (!b || !a) throw new Error('describeJudgement returned fewer than three lines');
    const comparable = id !== 'ending' || (!firstRanOut && !latestRanOut);
    let line: string;
    if (!comparable) line = "Time ran out, so the ending isn't compared";
    else if (now === was) line = `${b.label}: still ${a.value}`;
    else line = `${b.label}: ${b.value} → ${a.value}`;
    return { id, label: b.label, before: b.value, after: a.value, improved: comparable && now > was, arrow: 'up', line };
  });
}

// Puts the first try and the latest try side by side. Plain code, no AI: every word comes from the saved numbers and marks.
export function compareAttempts(first: Attempt, latest: Attempt): { rows: CompareRow[]; summary: Summary } {
  const rows = [fillerRow(first, latest), speedRow(first, latest), ...markRows(first, latest)];

  if (rows.some((r) => r.improved)) return { rows, summary: { improved: true } };

  // Nothing got better. Say plainly whether anything changed at all, then give the retry's own tip as the one next step.
  const changed = rows.some((r) => r.before !== r.after);
  return {
    rows,
    summary: {
      improved: false,
      message: changed ? 'Nothing improved this time.' : 'No change this time.',
      nextStep: latest.tip ?? null,
    },
  };
}
