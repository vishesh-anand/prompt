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
  coaching: null,
  feedback_flagged: false,
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
});
