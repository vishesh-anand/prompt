import type { Averages } from './daySeries';

export type StartRow = {
  id: 'fillers' | 'speed' | 'clearPoint';
  label: string;
  before: string;
  after: string;
  improved: boolean;
  // Which way the arrow points when the row improved. Fewer filler words is down; the others are up.
  arrow: 'up' | 'down';
  // One plain sentence, whether or not it improved.
  line: string;
};

// Same bands as slowBelowWpm and fastAboveWpm in supabase/functions/_shared/pipeline/measure.ts.
const slowBelowWpm = 110;
const fastAboveWpm = 170;
// The marks are added up out of 6. Four or more is a clear point with support.
const clearPointOutOf = 6;

const speedBand = (wpm: number) => (wpm < slowBelowWpm ? 'too slow' : wpm > fastAboveWpm ? 'too fast' : 'good');
const per = (n: number) => `${n} a minute`;

function fillerRow(was: number | null, now: number | null): StartRow | null {
  if (was === null || now === null) return null;
  const before = Math.round(was);
  const after = Math.round(now);
  const line =
    after < before
      ? after === 0
        ? 'No filler words a minute now'
        : `${before - after} fewer filler ${before - after === 1 ? 'word' : 'words'} a minute`
      : after > before
        ? `${after - before} more filler ${after - before === 1 ? 'word' : 'words'} a minute`
        : `Filler words: still ${per(after)}`;
  return { id: 'fillers', label: 'Filler words', before: per(before), after: per(after), improved: after < before, arrow: 'down', line };
}

function speedRow(was: number | null, now: number | null): StartRow | null {
  if (was === null || now === null) return null;
  const before = Math.round(was);
  const after = Math.round(now);
  const bandBefore = speedBand(before);
  const bandAfter = speedBand(after);
  const line =
    bandBefore !== 'good' && bandAfter === 'good'
      ? 'Speed is now good'
      : bandBefore === bandAfter
        ? `Speed: still ${bandAfter}`
        : `Speed went from ${bandBefore} to ${bandAfter}`;
  return {
    id: 'speed',
    label: 'Speed',
    before: `${before} words a minute`,
    after: `${after} words a minute`,
    improved: bandBefore !== 'good' && bandAfter === 'good',
    arrow: 'up',
    line,
  };
}

function clearPointRow(was: number | null, now: number | null): StartRow | null {
  if (was === null || now === null) return null;
  // Halves are enough: the marks are whole numbers, and a day can average to .5 or less.
  const half = (v: number) => Math.round(v * 2) / 2;
  const before = half(was);
  const after = half(now);
  const shown = (v: number) => `${v} of ${clearPointOutOf}`;
  const line =
    after > before ? `Clear point: ${shown(before)} → ${shown(after)}` : after === before ? `Clear point: still ${shown(after)}` : `Clear point: ${shown(before)} → ${shown(after)}`;
  return { id: 'clearPoint', label: 'Clear point', before: shown(before), after: shown(after), improved: after > before, arrow: 'up', line };
}

export type StartComparison =
  | { kind: 'rows'; rows: StartRow[]; improved: boolean }
  // The starting point or this week has nothing to compare it with yet.
  | { kind: 'none' };

// Your starting point (the first recording) against this week's numbers. Plain code: every word comes from saved numbers.
export function compareToStart(start: Averages, week: Averages): StartComparison {
  const rows = [
    fillerRow(start.fillersPerMinute, week.fillersPerMinute),
    speedRow(start.wordsPerMinute, week.wordsPerMinute),
    clearPointRow(start.clearPoint, week.clearPoint),
  ].filter((r): r is StartRow => r !== null);
  if (rows.length === 0) return { kind: 'none' };
  return { kind: 'rows', rows, improved: rows.some((r) => r.improved) };
}
