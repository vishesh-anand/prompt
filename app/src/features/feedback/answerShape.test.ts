import type { AnswerMap, StepLabel } from '@/lib/schemas/map';

import { headline, pointArrival, segments, spokenShape, stepWords } from './answerShape';

// Steps from [label, starting second] pairs; sentences numbered one per step from 1. pointAtSeconds is the first
// Direction or Point step, as the map stage saves it.
function shape(...steps: [StepLabel, number][]): Pick<AnswerMap, 'steps' | 'pointAtSeconds'> {
  const mapped = steps.map(([label, atSeconds], i) => ({ label, atSeconds, sentence: i + 1 }));
  const first = mapped.find((s) => s.label === 'direction' || s.label === 'point');
  return { steps: mapped, pointAtSeconds: first ? first.atSeconds : null };
}

// The two mockups in design-system/feedback-d2/.
const workMockup = shape(['off_track', 0], ['support', 18], ['off_track', 40], ['point', 70], ['ending', 95]);
const storyMockup = shape(['direction', 0], ['support', 12], ['point', 58], ['off_track', 64]);

describe('the headline', () => {
  it('a point found while talking counts the off-track steps before it', () => {
    expect(headline(workMockup)).toBe('You found your point while talking, after two off-track steps.');
    expect(headline(shape(['off_track', 0], ['support', 10], ['point', 30]))).toBe('You found your point while talking, after one off-track step.');
  });

  it('a late point that was chosen gives its time, a build-up as a story and a frame as saying where you were going', () => {
    expect(headline(shape(['support', 0], ['support', 20], ['point', 58]))).toBe('You set up a story, then made your point at 0:58.');
    expect(headline(shape(['support', 0], ['direction', 20], ['point', 58]))).toBe('You said where you were going, then made your point at 0:58.');
  });

  it('a frame first and a later point says both; the point time is the point step, not the frame', () => {
    expect(headline(storyMockup)).toBe('You said where you were going, then made your point at 0:58.');
    expect(headline(shape(['direction', 0], ['point', 9]))).toBe('You told the listener where you were going in your first sentence.');
    expect(headline(shape(['support', 0], ['direction', 8], ['point', 12]))).toBe('You told the listener where you were going at 0:08.');
  });

  it('an early point, first or soon after', () => {
    expect(headline(shape(['point', 0], ['support', 9]))).toBe('You made your point in your first sentence.');
    expect(headline(shape(['support', 0], ['point', 6.4]))).toBe('You made your point at 0:06.');
  });

  it('no point step', () => {
    expect(headline(shape(['support', 0], ['off_track', 20]))).toBe('A listener couldn’t find one main point here.');
    expect(pointArrival(shape(['direction', 0], ['support', 20]))).toBe('none');
  });
});

describe('the answer line', () => {
  it('each step is as wide as its share of the time spoken, and the last runs to the last word', () => {
    const line = segments(shape(['off_track', 0], ['point', 30], ['ending', 90]).steps, 120);
    expect(line.map((s) => s.share)).toEqual([0.25, 0.5, 0.25]);
    expect(line.map((s) => s.style)).toEqual(['offTrack', 'point', 'outline']);
  });

  it('never draws a negative or empty line', () => {
    expect(segments(shape(['point', 0]).steps, 0).map((s) => s.share)).toEqual([1]);
    expect(segments(shape(['point', 0], ['ending', 10]).steps, 5).map((s) => s.share)).toEqual([1, 0]);
  });

  it('the steps in words, with the point and its time', () => {
    expect(stepWords(workMockup.steps, false).map((w) => w.text).join(' → ')).toBe('Off track → Support → Off track → Point at 1:10 → Ending');
    expect(stepWords(workMockup.steps, false).filter((w) => w.isPoint).map((w) => w.text)).toEqual(['Point at 1:10']);
  });

  it('a timer-stopped answer without an ending says time ran out', () => {
    expect(stepWords(storyMockup.steps, true).map((w) => w.text)).toEqual(['Direction', 'Support', 'Point at 0:58', 'Off track', 'Time ran out']);
    expect(stepWords(workMockup.steps, true).map((w) => w.text).at(-1)).toBe('Ending');
  });

  it('VoiceOver reads the line as one sentence', () => {
    expect(spokenShape(workMockup.steps, false)).toBe('Off track, support, off track, then your point at 1:10, then an ending.');
    expect(spokenShape(storyMockup.steps, false)).toBe('Direction, support, then your point at 0:58, then an off-track step.');
    expect(spokenShape(shape(['point', 0], ['support', 9]).steps, false)).toBe('Your point at 0:00, then support.');
    expect(spokenShape(shape(['support', 0], ['off_track', 9]).steps, true)).toBe('Support, off track, and no clear point, then time ran out.');
  });
});
