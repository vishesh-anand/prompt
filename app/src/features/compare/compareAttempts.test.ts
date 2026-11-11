import type { AnswerMap, StepLabel } from '@/lib/schemas/map';
import { sampleMetrics } from '@/lib/sampleMetrics';

import { compareAttempts, tipKind, type Attempt, type CompareResult } from './compareAttempts';

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

const tip = 'Say your point in your first sentence.';
const foundLate = attempt([['off_track', 0], ['support', 20], ['off_track', 40], ['point', 70], ['ending', 100]], { off: 0.4, stumbles: 4, tip });
const early = attempt([['point', 0], ['support', 20], ['off_track', 40], ['ending', 55]], { off: 0.1, stumbles: 1, tip: 'Finish with one sentence.' });
const closer = attempt([['off_track', 0], ['support', 12], ['point', 45], ['ending', 66]], { off: 0.15, stumbles: 1, tip });
const noPoint = attempt([['off_track', 0], ['support', 30]], { off: 0.5, stumbles: 2, tip: 'Pick one thing.' });

const row = (r: CompareResult, id: 'point' | 'offTrack' | 'stumbles') => {
  const found = r.rows.find((x) => x.id === id);
  if (!found) throw new Error(`no ${id} row`);
  return found;
};

describe('what the tip was about, read from the first try', () => {
  it('a point found while talking', () => expect(tipKind(foundLate.map, false)).toBe('found_late'));
  it('no point step', () => expect(tipKind(noPoint.map, true)).toBe('no_point'));
  it('a late point that was chosen is a tip only when the question wanted a direct answer', () => {
    const chosen = attempt([['direction', 0], ['support', 10], ['point', 40]]);
    expect(tipKind(chosen.map, false)).toBe('other');
    expect(tipKind(chosen.map, true)).toBe('direct_late');
  });
  it('lots of time off track, with an early point', () => {
    expect(tipKind(attempt([['point', 0], ['off_track', 10], ['ending', 50]], { off: 0.3 }).map, false)).toBe('off_track');
  });
});

describe('the status and the check', () => {
  it('the tip worked: the point moved to the first sentence', () => {
    const r = compareAttempts(foundLate, early, true);
    expect(r).toMatchObject({ tip, status: 'worked', check: 'You told the listener where you were going in your first sentence.', nextTip: null });
  });
  it('worked by a frame a little later than the first sentence says when', () => {
    const r = compareAttempts(foundLate, attempt([['support', 0], ['direction', 6], ['point', 9], ['ending', 40]]), false);
    expect(r).toMatchObject({ status: 'worked', check: 'You told the listener where you were going by 0:06.' });
  });
  it('closer: the point came sooner by more than noise, but not early', () => {
    const r = compareAttempts(foundLate, closer, true);
    expect(r).toMatchObject({ status: 'closer', check: 'Your point came 25 seconds sooner, at 0:45, but not in your first sentence.' });
    expect(r.nextTip).toEqual({ heading: 'Same tip, one more try', tip });
  });
  it('not yet: about the same time, or later', () => {
    const same = attempt([['off_track', 0], ['point', 72], ['ending', 98]], { off: 0.42, tip });
    expect(compareAttempts(foundLate, same, true)).toMatchObject({ status: 'notYet', check: 'Your point came at 1:12, about when it came on your first try.' });
    const later = attempt([['off_track', 0], ['point', 90]], { tip: 'Another tip.' });
    const r = compareAttempts(foundLate, later, true);
    expect(r).toMatchObject({ status: 'notYet', check: 'Your point came at 1:30, later than on your first try.' });
    expect(r.nextTip).toEqual({ heading: 'One thing to try next', tip: 'Another tip.' });
  });
  it('not yet: the point was lost', () => {
    expect(compareAttempts(foundLate, noPoint, true)).toMatchObject({ status: 'notYet', check: 'A listener couldn’t find one main point this time.' });
  });
  it('a direct answer needs the point itself in the first 15 seconds, not only a frame', () => {
    const chosen = attempt([['direction', 0], ['support', 10], ['point', 40]], { tip });
    expect(compareAttempts(chosen, chosen, true).status).toBe('notYet');
    expect(compareAttempts(chosen, attempt([['point', 3], ['support', 20]]), true).status).toBe('worked');
  });
  it('off track: worked under the line, closer when it fell but stayed over, not yet otherwise', () => {
    const was = attempt([['point', 0], ['off_track', 10], ['ending', 50]], { off: 0.4, tip: 'Cut the aside.' });
    expect(compareAttempts(was, attempt([['point', 0], ['support', 10]], { off: 0.1 }), false)).toMatchObject({ status: 'worked', check: 'You cut the off-track time from 40% to 10%.' });
    expect(compareAttempts(was, attempt([['point', 0], ['support', 10]], { off: 0.3 }), false)).toMatchObject({
      status: 'closer',
      check: 'Off-track time fell from 40% to 30%, but it’s still more than a quarter of your answer.',
    });
    expect(compareAttempts(was, attempt([['point', 0], ['support', 10]], { off: 0.38 }), false)).toMatchObject({
      status: 'notYet',
      check: 'Off-track time was 40% on your first try and 38% on this one.',
    });
  });
  it('no point: worked once a point is found', () => {
    expect(compareAttempts(noPoint, early, false)).toMatchObject({ status: 'worked', check: 'A listener found your point this time.' });
    expect(compareAttempts(noPoint, noPoint, false)).toMatchObject({ status: 'notYet', check: 'A listener still couldn’t find one main point.' });
  });
  it('a tip about something else is not measured here, and offers no next tip', () => {
    const a = attempt([['point', 0], ['ending', 40]], { stumbles: 3, tip: 'Pause instead of um.' });
    const r = compareAttempts(a, attempt([['point', 0], ['ending', 40]], { stumbles: 1, tip: 'Pause instead of um.' }), false);
    expect(r).toMatchObject({ status: 'notMeasured', nextTip: null });
    expect(r.check).toBe('This screen compares your point, off-track time and stumbles, not this tip. Listen back to hear how it went.');
  });
});

describe('the rows', () => {
  it('say each fact once, as "X to Y"', () => {
    const r = compareAttempts(foundLate, closer, true);
    expect(r.rows.map((x) => x.fact)).toEqual(['Point: 1:10 to 0:45.', 'Off track: 40% to 15%.', 'Stumbles: 4 to 1.']);
  });
  it('the first sentence and the start in plain words', () => {
    expect(row(compareAttempts(foundLate, early, true), 'point').fact).toBe('Point: 1:10 to your first sentence.');
    expect(row(compareAttempts(early, early, false), 'point').fact).toBe('Point: at the start both times.');
    expect(row(compareAttempts(noPoint, attempt([['direction', 0], ['point', 8]]), false), 'point').fact).toBe('Point: none last time, 0:08 now.');
    expect(row(compareAttempts(early, early, false), 'offTrack').fact).toBe('Off track: 10% both times.');
  });
  it('the tip’s own row is not green when the tip wasn’t met: "Sooner", while the other rows are', () => {
    const r = compareAttempts(foundLate, closer, true);
    expect(row(r, 'point')).toMatchObject({ trend: 'better', word: 'Sooner', credited: false });
    expect(row(r, 'offTrack')).toMatchObject({ trend: 'better', word: 'Better', credited: true });
    expect(row(r, 'stumbles')).toMatchObject({ trend: 'better', word: 'Better', credited: true });
  });
  it('the tip worked: its row is green', () => {
    expect(row(compareAttempts(foundLate, early, true), 'point')).toMatchObject({ word: 'Better', credited: true });
  });
  it('nothing is green when the tip is not measured here', () => {
    const a = attempt([['point', 0], ['ending', 40]], { stumbles: 3 });
    const r = compareAttempts(a, attempt([['point', 0], ['ending', 40]], { stumbles: 1 }), false);
    expect(r.rows.every((x) => !x.credited)).toBe(true);
    expect(row(r, 'stumbles').word).toBe('Better');
  });
  it('changes within noise are "Same" when they fall, and never "Same" when they rise', () => {
    const was = attempt([['point', 10], ['ending', 40]], { off: 0.2, stumbles: 2 });
    const r = compareAttempts(was, attempt([['point', 8], ['ending', 40]], { off: 0.18, stumbles: 2 }), false);
    expect(r.rows.map((x) => x.word)).toEqual(['Same', 'Same', 'Same']);
    const up = compareAttempts(was, attempt([['point', 13], ['ending', 40]], { off: 0.23, stumbles: 3 }), false);
    expect(up.rows.map((x) => x.word)).toEqual(['A little later', 'A little more', 'A little more']);
  });
  it('bigger moves the wrong way say "Later" and "More"', () => {
    const r = compareAttempts(early, foundLate, false);
    expect(r.rows.map((x) => x.word)).toEqual(['Later', 'More', 'More']);
    expect(r.rows.every((x) => !x.credited)).toBe(true);
  });
  it('counts only pauses in the middle of a sentence as stumbles', () => {
    expect(row(compareAttempts(foundLate, early, true), 'stumbles').fact).toBe('Stumbles: 4 to 1.');
  });
});
