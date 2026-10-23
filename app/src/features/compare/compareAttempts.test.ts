import { sampleMetrics } from '@/lib/sampleMetrics';

import { compareAttempts, type Attempt, type CompareRow } from './compareAttempts';

type Band = 'too_slow' | 'good' | 'too_fast' | null;
type Score = 0 | 1 | 2;

// Only the values a test cares about are written out; everything else is a calm, middling default.
function attempt(
  o: { fillers?: number; band?: Band; mainPoint?: Score; reason?: Score; ending?: Score; durationMs?: number; timeLimitMs?: number; tip?: string } = {},
): Attempt {
  const { fillers = 5, band = 'good', mainPoint = 1, reason = 1, ending = 1, durationMs = 40_000, timeLimitMs = 120_000, tip = 'Say your point first.' } = o;
  const metrics = sampleMetrics({ fillers: { total: fillers, byWord: {} }, pace: { wordsPerMinute: band === null ? null : 140, band } });
  const mark = (score: Score) => ({ score, quotes: ['x'], why: 'x' });
  return {
    metrics,
    judgement: { mainPoint: mark(mainPoint), reasonOrExample: mark(reason), ending: mark(ending), mainPointAtSeconds: 3 },
    durationMs,
    timeLimitMs,
    tip,
  };
}

function row(rows: CompareRow[], id: CompareRow['id']): CompareRow {
  const found = rows.find((r) => r.id === id);
  if (!found) throw new Error(`no ${id} row`);
  return found;
}

describe('filler words', () => {
  it.each([
    { from: 9, to: 5, improved: true, line: '4 fewer filler words' },
    { from: 3, to: 2, improved: true, line: '1 fewer filler word' },
    { from: 4, to: 0, improved: true, line: 'No filler words this time' },
    { from: 5, to: 5, improved: false, line: 'Still 5 filler words' },
    { from: 1, to: 1, improved: false, line: 'Still 1 filler word' },
    { from: 0, to: 0, improved: false, line: 'No filler words either time' },
    { from: 2, to: 6, improved: false, line: '4 more filler words' },
    { from: 2, to: 3, improved: false, line: '1 more filler word' },
  ])('$from to $to: "$line"', ({ from, to, improved, line }) => {
    const r = row(compareAttempts(attempt({ fillers: from }), attempt({ fillers: to })).rows, 'fillers');
    expect(r.improved).toBe(improved);
    expect(r.line).toBe(line);
    expect(r.count).toEqual({ before: from, after: to });
  });

  it('fewer filler words is marked with a down arrow', () => {
    expect(row(compareAttempts(attempt({ fillers: 9 }), attempt({ fillers: 4 })).rows, 'fillers').arrow).toBe('down');
  });
});

describe('speed', () => {
  it.each([
    { from: 'too_fast', to: 'good', improved: true, shown: ['Too fast', 'Good'], line: 'Speed is now good' },
    { from: 'too_slow', to: 'good', improved: true, shown: ['Too slow', 'Good'], line: 'Speed is now good' },
    { from: 'good', to: 'good', improved: false, shown: ['Good', 'Good'], line: 'Speed stayed good' },
    { from: 'good', to: 'too_fast', improved: false, shown: ['Good', 'Too fast'], line: 'Speed went from good to too fast' },
    { from: 'too_fast', to: 'too_fast', improved: false, shown: ['Too fast', 'Too fast'], line: 'Speed is still too fast' },
    { from: 'too_fast', to: 'too_slow', improved: false, shown: ['Too fast', 'Too slow'], line: 'Speed went from too fast to too slow' },
    { from: null, to: 'good', improved: false, shown: ['—', 'Good'], line: 'Not enough words to measure speed' },
    { from: 'good', to: null, improved: false, shown: ['Good', '—'], line: 'Not enough words to measure speed' },
  ] as { from: Band; to: Band; improved: boolean; shown: [string, string]; line: string }[])(
    '$from to $to: "$line"',
    ({ from, to, improved, shown, line }) => {
      const r = row(compareAttempts(attempt({ band: from }), attempt({ band: to })).rows, 'speed');
      expect(r.improved).toBe(improved);
      expect([r.before, r.after]).toEqual(shown);
      expect(r.line).toBe(line);
    },
  );
});

describe('clear point', () => {
  it.each([
    { id: 'mainPoint', label: 'Main point', words: ['Missing', 'Vague', 'Clear'] },
    { id: 'reasonOrExample', label: 'Reason or example', words: ['None', 'General', 'Specific'] },
  ] as const)('$label uses the level words and only a higher mark counts as better', ({ id, label, words }) => {
    const key = id === 'mainPoint' ? 'mainPoint' : 'reason';
    const scores: Score[] = [0, 1, 2];
    for (const from of scores) {
      for (const to of scores) {
        const r = row(compareAttempts(attempt({ [key]: from }), attempt({ [key]: to })).rows, id);
        expect([r.before, r.after]).toEqual([words[from], words[to]]);
        expect(r.improved).toBe(to > from);
        expect(r.arrow).toBe('up');
        if (to > from) expect(r.line).toBe(`${label}: ${words[from]} → ${words[to]}`);
        if (to === from) expect(r.line).toBe(`${label}: still ${words[to]}`);
        if (to < from) expect(r.line).toBe(`${label}: ${words[from]} → ${words[to]}`);
      }
    }
  });

  it('the ending counts when neither answer ran out of time', () => {
    const r = row(compareAttempts(attempt({ ending: 0 }), attempt({ ending: 2 })).rows, 'ending');
    expect([r.before, r.after, r.improved]).toEqual(['Cut off', 'Lands', true]);
    expect(r.line).toBe('Ending: Cut off → Lands');
  });
});

describe('when the time ran out', () => {
  const firstRanOut = { durationMs: 120_000, timeLimitMs: 120_000 };
  const retryRanOut = { durationMs: 90_000, timeLimitMs: 90_000 };
  const firstStopped = { durationMs: 40_000, timeLimitMs: 120_000 };
  const retryStopped = { durationMs: 40_000, timeLimitMs: 90_000 };
  // Recorded before step B, when every answer stopped at 60 seconds.
  const oldRanOut = { durationMs: 60_000, timeLimitMs: 60_000 };

  it.each([
    { name: 'the first try', first: firstRanOut, latest: retryStopped, shown: ['Time ran out', 'Lands'] },
    { name: 'the second try', first: firstStopped, latest: retryRanOut, shown: ['Cut off', 'Time ran out'] },
    { name: 'both tries', first: firstRanOut, latest: retryRanOut, shown: ['Time ran out', 'Time ran out'] },
    { name: 'a first try from before step B', first: oldRanOut, latest: retryStopped, shown: ['Time ran out', 'Lands'] },
  ])('$name: the ending is never marked better', ({ first, latest, shown }) => {
    const result = compareAttempts(attempt({ ending: 0, ...first }), attempt({ ending: 2, ...latest }));
    const r = row(result.rows, 'ending');
    expect([r.before, r.after]).toEqual(shown);
    expect(r.improved).toBe(false);
    expect(r.line).toBe("Time ran out, so the ending isn't compared");
    expect(result.summary.improved).toBe(false);
  });

  it('a 60-second answer under the 2-minute limit stopped by choice, so its ending is compared', () => {
    const result = compareAttempts(attempt({ ending: 0, durationMs: 60_000, timeLimitMs: 120_000 }), attempt({ ending: 2, ...retryStopped }));
    expect(row(result.rows, 'ending').improved).toBe(true);
  });
});

describe('summary', () => {
  it('is improved when any row improved, even if another got worse', () => {
    const result = compareAttempts(attempt({ fillers: 9, mainPoint: 2 }), attempt({ fillers: 4, mainPoint: 1 }));
    expect(result.summary).toEqual({ improved: true });
  });

  it('says "No change this time." and gives the next step when nothing changed', () => {
    const result = compareAttempts(attempt(), attempt({ tip: 'Pause instead of saying um.' }));
    expect(result.summary).toEqual({ improved: false, message: 'No change this time.', nextStep: 'Pause instead of saying um.' });
  });

  it('says "Nothing improved this time." when something got worse and nothing got better', () => {
    const result = compareAttempts(attempt({ fillers: 2 }), attempt({ fillers: 6 }));
    expect(result.summary).toMatchObject({ improved: false, message: 'Nothing improved this time.' });
  });

  it('has no next step when the retry has no tip', () => {
    const result = compareAttempts(attempt(), { ...attempt(), tip: undefined });
    expect(result.summary).toEqual({ improved: false, message: 'No change this time.', nextStep: null });
  });

  it('a row that is not better never carries the improvement arrow', () => {
    const rows = compareAttempts(attempt({ fillers: 2, mainPoint: 2 }), attempt({ fillers: 6, mainPoint: 0 })).rows;
    expect(rows.filter((r) => r.improved)).toEqual([]);
  });
});

describe('the coach voice (DESIGN.md)', () => {
  const grid: [Attempt, Attempt][] = [
    [attempt({ fillers: 9, band: 'too_fast', mainPoint: 0 }), attempt({ fillers: 0, band: 'good', mainPoint: 2 })],
    [attempt({ fillers: 1 }), attempt({ fillers: 1 })],
    [attempt({ fillers: 1, band: null }), attempt({ fillers: 12, band: 'too_slow', mainPoint: 0, reason: 0 })],
    [attempt({ durationMs: 120_000 }), attempt({ durationMs: 90_000, timeLimitMs: 90_000, ending: 2 })],
  ];

  it('has no praise, alarm, or exclamation marks, and every line is short', () => {
    for (const [first, latest] of grid) {
      const { rows, summary } = compareAttempts(first, latest);
      const lines = [...rows.map((r) => r.line), ...(summary.improved ? [] : [summary.message])];
      for (const line of lines) {
        expect(line).not.toMatch(/great|amazing|awesome|oops|!|fail|bad|wrong/i);
        expect(line.length).toBeLessThanOrEqual(60);
      }
    }
  });
});
