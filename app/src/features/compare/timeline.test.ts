import type { AnswerMap } from '@/lib/schemas/map';

import { scaleSeconds, timeline } from './timeline';

const map = (steps: [AnswerMap['steps'][number]['label'], number][]): AnswerMap => ({
  version: 8,
  point: { restatement: 'x' },
  steps: steps.map(([label, atSeconds], i) => ({ label, atSeconds, sentence: i + 1 })),
  pointAtSeconds: null,
  offTrackShare: 0,
  didntFollow: [],
  restarts: [],
  noticed: [],
});

describe('the two answer lines on one scale', () => {
  it('runs from 0:00 to 2:00', () => expect(scaleSeconds).toBe(120));
  it('a 60-second answer fills half the scale, with the point where it starts', () => {
    const t = timeline(map([['off_track', 0], ['point', 30]]), 60);
    expect(t.width).toBe(0.5);
    expect(t.pointAt).toEqual({ share: 0.25, seconds: 30 });
    expect(t.segments.map((s) => s.share)).toEqual([0.5, 0.5]);
  });
  it('never runs past the scale, and has no point marker without a point', () => {
    const t = timeline(map([['support', 0], ['off_track', 100]]), 130);
    expect(t.width).toBe(1);
    expect(t.pointAt).toBeNull();
  });
  it('a last step after the last measured word still fits', () => {
    expect(timeline(map([['point', 0], ['ending', 70]]), 40).width).toBeCloseTo(70 / 120);
  });
});
