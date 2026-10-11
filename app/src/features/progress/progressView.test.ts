import type { WeekAnswer } from '@/lib/schemas/progress';

import { noteView, startMessage, startView } from './progressView';

const mark = { score: 1 as const, quotes: ['x'], why: 'x' };
function answer(o: { metrics?: boolean; words?: number } = {}): WeekAnswer {
  const { metrics = true, words = 80 } = o;
  return {
    id: 'a',
    retry_of: null,
    created_at: '2026-10-05T15:00:00Z',
    duration_ms: 30_000,
    metrics: metrics
      ? {
          wordCount: words,
          fillers: { total: 4, byWord: {} },
          pace: { wordsPerMinute: 140, band: 'good' },
          pauses: { count: 0, longestMs: 0, atSeconds: [] },
          restarts: { count: 0, atSeconds: [] },
        }
      : null,
    judgement: metrics && words > 0 ? { mainPoint: mark, reasonOrExample: mark, ending: mark, mainPointAtSeconds: 2 } : null,
  };
}

describe('startView', () => {
  it('is none before you have answered anything', () => {
    expect(startView({ baselineId: null, loading: false, failed: false, answer: undefined })).toEqual({ kind: 'none' });
  });

  it('is loading while the starting point loads', () => {
    expect(startView({ baselineId: 'a', loading: true, failed: false, answer: undefined })).toEqual({ kind: 'loading' });
  });

  it('is failed when it could not be loaded', () => {
    expect(startView({ baselineId: 'a', loading: false, failed: true, answer: undefined })).toEqual({ kind: 'failed' });
  });

  it('is scoring while the recording has no measurements yet', () => {
    expect(startView({ baselineId: 'a', loading: false, failed: false, answer: answer({ metrics: false }) })).toEqual({ kind: 'scoring' });
  });

  it('is unscorable when it had no words', () => {
    expect(startView({ baselineId: 'a', loading: false, failed: false, answer: answer({ words: 0 }) })).toEqual({ kind: 'unscorable' });
  });

  it('is ready with the same numbers a day of the chart would have', () => {
    expect(startView({ baselineId: 'a', loading: false, failed: false, answer: answer() })).toEqual({
      kind: 'ready',
      numbers: { fillersPerMinute: 8, wordsPerMinute: 140, clearPoint: 3 },
    });
  });
});

describe('noteView', () => {
  it('is loading until the server answers, and failed if it could not', () => {
    expect(noteView(null, false)).toEqual({ kind: 'loading' });
    expect(noteView(null, true)).toEqual({ kind: 'failed' });
  });

  it('shows the note when there is one', () => {
    expect(noteView({ practiceDays: 4, daysNeeded: 3, note: 'Say it first.' }, false)).toEqual({ kind: 'note', text: 'Say it first.' });
  });

  it('counts the days to go with the server\'s own count', () => {
    expect(noteView({ practiceDays: 2, daysNeeded: 3, note: null }, false)).toEqual({ kind: 'toGo', practiceDays: 2, daysNeeded: 3 });
  });

  it('says it is waiting for scores when the days are there but the note is not', () => {
    expect(noteView({ practiceDays: 3, daysNeeded: 3, note: null }, false)).toEqual({ kind: 'scoring' });
  });

  it('keeps showing a note it had if a later refresh failed', () => {
    expect(noteView({ practiceDays: 4, daysNeeded: 3, note: 'Kept.' }, true)).toEqual({ kind: 'note', text: 'Kept.' });
  });
});

describe('startMessage', () => {
  const ready = { kind: 'ready' as const, numbers: { fillersPerMinute: 4, wordsPerMinute: 140, clearPoint: 3 } };

  it('has a plain sentence for every state without rows', () => {
    expect(startMessage({ kind: 'none' }, null)).toMatch(/appears after you give one/);
    expect(startMessage({ kind: 'scoring' }, null)).toMatch(/still being scored/);
    expect(startMessage({ kind: 'unscorable' }, null)).toMatch(/no words we could score/);
    expect(startMessage({ kind: 'failed' }, null)).toMatch(/didn't load/);
    expect(startMessage(ready, 'none')).toMatch(/after your first scored answer this week/);
  });

  it('shows nothing while loading, and lets the rows show when there are rows', () => {
    expect(startMessage({ kind: 'loading' }, null)).toBe('');
    expect(startMessage(ready, 'rows')).toBeNull();
  });

  it('never says anything alarming', () => {
    for (const kind of ['none', 'scoring', 'unscorable', 'failed'] as const) {
      expect(startMessage({ kind }, null)).not.toMatch(/!|error|wrong|bad|fail/i);
    }
  });
});
