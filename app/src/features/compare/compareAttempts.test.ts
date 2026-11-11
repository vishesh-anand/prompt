import type { AnswerMap, StepLabel } from '@/lib/schemas/map';
import { sampleMetrics } from '@/lib/sampleMetrics';

import { compareAttempts, tipKind, type Attempt } from './compareAttempts';

// A try from its steps ([label, seconds from the first word]), the share of time off track and how many pauses fell mid-sentence.
function attempt(steps: [StepLabel, number][], o: { off?: number; stumbles?: number; tip?: string } = {}): Attempt {
  const built = steps.map(([label, atSeconds], i) => ({ label, atSeconds, sentence: i + 1 }));
  const first = built.find((s) => s.label === 'direction' || s.label === 'point');
  const map: AnswerMap = { version: 8, point: { restatement: 'x' }, steps: built, pointAtSeconds: first?.atSeconds ?? null, offTrackShare: o.off ?? 0, didntFollow: [], restarts: [], noticed: [] };
  const pauses = [
    ...Array.from({ length: o.stumbles ?? 0 }, (_, i) => ({ atSeconds: i, ms: 1500, midSentence: true })),
    { atSeconds: 50, ms: 2000, midSentence: false }, // between sentences: never counted
  ];
  return { map, metrics: sampleMetrics({ pauses }), tip: o.tip };
}

const foundLate = attempt([['off_track', 0], ['support', 20], ['off_track', 40], ['point', 70], ['ending', 100]], { off: 0.4, stumbles: 4 });
const early = attempt([['point', 0], ['support', 20], ['ending', 55]], { off: 0.1, stumbles: 1, tip: 'Next tip.' });
const row = (r: ReturnType<typeof compareAttempts>, id: 'point' | 'offTrack' | 'stumbles') => {
  const found = r.rows.find((x) => x.id === id);
  if (!found) throw new Error(`no ${id} row`);
  return found;
};

describe('what the tip was about, read from the first try', () => {
  it('a point found while talking', () => expect(tipKind(foundLate.map, false)).toBe('found_late'));
  it('no point step', () => expect(tipKind(attempt([['off_track', 0], ['support', 20]]).map, true)).toBe('no_point'));
  it('a late point that was chosen is a tip only when the question wanted a direct answer', () => {
    const chosen = attempt([['direction', 0], ['support', 10], ['point', 40]]);
    expect(tipKind(chosen.map, false)).toBe('other');
    expect(tipKind(chosen.map, true)).toBe('direct_late');
  });
  it('lots of time off track, with an early point', () => {
    expect(tipKind(attempt([['point', 0], ['off_track', 10], ['ending', 50]], { off: 0.3 }).map, false)).toBe('off_track');
  });
});

describe('the rows', () => {
  const result = compareAttempts(foundLate, early, true);

  it('shows when the point came, with a note when it came sooner', () => {
    expect(row(result, 'point')).toMatchObject({ before: '1:10', after: '0:00', improved: true, line: 'Your point came at 0:00, not 1:10.' });
  });
  it('shows the off-track share as whole percentages that count into place', () => {
    expect(row(result, 'offTrack')).toMatchObject({ before: '40%', after: '10%', count: { before: 40, after: 10, unit: '%' }, improved: true, line: 'Off track: 40% to 10%.' });
  });
  it('counts only pauses in the middle of a sentence as stumbles', () => {
    expect(row(result, 'stumbles')).toMatchObject({ before: '4', after: '1', improved: true, line: 'Stumbles: 4 to 1.' });
  });
  it('ignores changes smaller than the noise', () => {
    const r = compareAttempts(attempt([['point', 10], ['ending', 40]], { off: 0.2, stumbles: 2 }), attempt([['point', 8], ['ending', 40]], { off: 0.18, stumbles: 2 }), false);
    expect(r.rows.some((x) => x.improved)).toBe(false);
    expect(row(r, 'point').line).toBe('Your point came at about the same time: 0:08.');
    expect(row(r, 'offTrack').line).toBe('Off track is about the same: 18%.');
    expect(row(r, 'stumbles').line).toBe('Still 2 stumbles.');
  });
  it('says plainly when things got worse', () => {
    const r = compareAttempts(early, foundLate, false);
    expect(row(r, 'point').line).toBe('Your point came later this time, at 1:10.');
    expect(row(r, 'offTrack').line).toBe('Off track went up, from 10% to 40%.');
    expect(row(r, 'stumbles').line).toBe('More stumbles this time: 1 to 4.');
  });
  it('a point found where there was none counts as better', () => {
    const none = attempt([['off_track', 0], ['support', 30]]);
    const r = compareAttempts(none, early, false);
    expect(row(r, 'point')).toMatchObject({ before: 'No point', improved: true, line: 'A listener found your point this time.' });
  });
  it('no point either time, and one that was lost', () => {
    const none = attempt([['off_track', 0], ['support', 30]]);
    expect(row(compareAttempts(none, none, false), 'point').line).toBe('A listener couldn’t find a main point either time.');
    expect(row(compareAttempts(early, none, false), 'point').line).toBe('A listener couldn’t find a main point this time.');
  });
});

describe('the instruction, checked first', () => {
  it('met: the point now comes in the first sentence', () => {
    expect(compareAttempts(foundLate, early, true).instruction).toEqual({
      met: true,
      line: 'You told the listener where you were going in your first sentence. Last time, your point came at 1:10.',
    });
  });
  it('met later than the first sentence says when', () => {
    const r = compareAttempts(foundLate, attempt([['direction', 0], ['support', 2], ['point', 9], ['ending', 40]]), false);
    expect(r.instruction.met).toBe(true);
  });
  it('not met: the point is still late', () => {
    const r = compareAttempts(foundLate, attempt([['off_track', 0], ['point', 45]], { off: 0.15, tip: 'Next tip.' }), true);
    expect(r.instruction).toEqual({ met: false, line: 'Your point came at 0:45, so the listener still waited for it. Last time, your point came at 1:10.' });
  });
  it('a direct answer must put the point itself in the first 15 seconds', () => {
    const chosen = attempt([['direction', 0], ['support', 10], ['point', 40]]);
    const frameOnly = attempt([['direction', 0], ['support', 10], ['point', 40]]);
    expect(compareAttempts(chosen, frameOnly, true).instruction.met).toBe(false);
    expect(compareAttempts(chosen, attempt([['point', 3], ['support', 20]]), true).instruction.met).toBe(true);
  });
  it('off track: met when it fell under the line and by a real amount', () => {
    const was = attempt([['point', 0], ['off_track', 10], ['ending', 50]], { off: 0.4 });
    expect(compareAttempts(was, attempt([['point', 0], ['support', 10]], { off: 0.1 }), false).instruction).toEqual({ met: true, line: 'You cut the off-track time from 40% to 10%.' });
    expect(compareAttempts(was, attempt([['point', 0], ['support', 10]], { off: 0.3 }), false).instruction).toEqual({ met: false, line: 'Off track was 40% last time and 30% this time.' });
  });
  it('no point: met once a point is found', () => {
    const none = attempt([['off_track', 0], ['support', 30]]);
    expect(compareAttempts(none, early, false).instruction).toEqual({ met: true, line: 'A listener found your point this time.' });
    expect(compareAttempts(none, none, false).instruction.met).toBe(false);
  });
  it('a tip about something else has no check, only the numbers', () => {
    const r = compareAttempts(attempt([['point', 0], ['ending', 40]], { stumbles: 3 }), attempt([['point', 0], ['ending', 40]], { stumbles: 1 }), false);
    expect(r.instruction).toEqual({ met: null, line: null });
    expect(r.summary).toEqual({ improved: true });
  });
});

describe('the summary', () => {
  it('improved when the instruction was met', () => {
    expect(compareAttempts(foundLate, early, true).summary).toEqual({ improved: true });
  });
  it('not improved when the tip was not followed, even if a number moved, and says so', () => {
    const r = compareAttempts(foundLate, attempt([['off_track', 0], ['point', 45]], { off: 0.15, stumbles: 1, tip: 'Next tip.' }), true);
    expect(r.summary).toEqual({ improved: false, message: 'Some numbers moved, but not what this tip asked for.', nextStep: 'Next tip.' });
  });
  it('nothing improved, and nothing changed', () => {
    const worse = attempt([['off_track', 0], ['support', 20], ['off_track', 40], ['point', 72], ['ending', 100]], { off: 0.42, stumbles: 5, tip: 'Next tip.' });
    expect(compareAttempts(foundLate, worse, true).summary).toEqual({ improved: false, message: 'Nothing improved this time.', nextStep: 'Next tip.' });
    expect(compareAttempts(foundLate, foundLate, true).summary).toEqual({ improved: false, message: 'No change this time.', nextStep: null });
  });
});
