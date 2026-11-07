import { answerSchema } from './answer';

const row = {
  id: 'a1',
  user_id: 'u1',
  question_id: 7,
  retry_of: null,
  audio_path: 'u1/a1.m4a',
  duration_ms: 30_000,
  time_limit_ms: 120_000,
  status: 'uploaded',
  metrics: null,
  judgement: null,
  map: null,
  coaching: null,
  feedback_flagged: false,
  listener_confirmed: null,
};

// A map as saved by map prompt v8, before step D2: no first-word time, no step openings, no moment times.
const v8Map = {
  version: 8,
  point: { restatement: 'You like cats.', quote: 'I like cats' },
  sentences: [{ sentence: 1, label: 'point' }],
  steps: [{ label: 'point', sentence: 1, atSeconds: 0 }],
  pointAtSeconds: 0,
  offTrackShare: 0,
  didntFollow: [{ quote: 'the timer thing', why: 'I could not tell how it connects.' }],
  restarts: [],
  noticed: [{ kind: 'pause', quote: 'we could just write it', why: 'A long silence.' }],
  effort: 2,
};

describe('the answer row the app reads', () => {
  it('accepts every status the pipeline writes, mapped included (step D)', () => {
    for (const status of ['uploaded', 'transcribed', 'measured', 'mapped', 'judged', 'coached', 'failed']) {
      expect(answerSchema.safeParse({ ...row, status }).success).toBe(true);
    }
    expect(answerSchema.safeParse({ ...row, status: 'mapping' }).success).toBe(false);
  });

  it('reads coaching with or without the steps and what changed', () => {
    const old = { tip: 't', betterVersion: 'b' };
    const now = { ...old, betterSteps: [{ label: 'point', text: 'b' }], whatChanged: 'w' };
    expect(answerSchema.parse({ ...row, coaching: old }).coaching).toEqual(old);
    expect(answerSchema.parse({ ...row, coaching: now }).coaching).toEqual(now);
  });

  it('reads the tip\'s reason and moment, which answers coached before step D2 don\'t have', () => {
    const now = { tip: 't', betterVersion: 'b', reason: 'r', moment: { quote: 'q', atSeconds: 4 } };
    expect(answerSchema.parse({ ...row, coaching: now }).coaching).toEqual(now);
  });

  it('reads a map saved before step D2, without the moment times', () => {
    const map = answerSchema.parse({ ...row, map: v8Map }).map;
    expect(map?.steps).toEqual([{ label: 'point', sentence: 1, atSeconds: 0 }]);
    expect(map?.firstWordAtSeconds).toBeUndefined();
    expect(map?.didntFollow[0]?.atSeconds).toBeUndefined();
  });

  it('reads a map with the moment times', () => {
    const now = {
      ...v8Map,
      version: 9,
      firstWordAtSeconds: 0.4,
      steps: [{ label: 'point', sentence: 1, atSeconds: 0, opening: 'I like cats.' }],
      noticed: [{ kind: 'pattern', quote: 'so so so', why: 'w', nextStep: 'n', atSeconds: 12 }],
    };
    const map = answerSchema.parse({ ...row, map: now }).map;
    expect(map?.firstWordAtSeconds).toBe(0.4);
    expect(map?.steps[0]?.opening).toBe('I like cats.');
    expect(map?.noticed[0]).toEqual({ kind: 'pattern', quote: 'so so so', why: 'w', nextStep: 'n', atSeconds: 12 });
  });

  it('a map in a shape it doesn\'t know becomes no map, so the answer still loads', () => {
    const parsed = answerSchema.safeParse({ ...row, map: { version: 8, steps: 'nope' } });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.map).toBeNull();
  });

  it('reads the listener tap: yes, no or not tapped', () => {
    for (const listener_confirmed of [true, false, null]) {
      expect(answerSchema.parse({ ...row, listener_confirmed }).listener_confirmed).toBe(listener_confirmed);
    }
  });
});
