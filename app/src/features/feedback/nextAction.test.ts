import { nextAction, tryAgainParams } from './nextAction';

const firstAttempt = { id: 'a1', question_id: 7, retry_of: null };
const retry = { id: 'a2', question_id: 7, retry_of: 'a1' };
const thirdTry = { id: 'a3', question_id: 7, retry_of: 'a1' };

describe('what the one accent button on the feedback screen does', () => {
  it('after a first attempt: try the same question again, pointing back at this answer', () => {
    expect(nextAction(firstAttempt)).toEqual({ kind: 'tryAgain', params: { questionId: 7, retryOf: 'a1', tipFrom: 'a1' } });
  });

  it('after a retry: see before and after', () => {
    expect(nextAction(retry)).toEqual({ kind: 'compare', answerId: 'a2' });
  });
});

describe('trying again from the before-and-after screen', () => {
  it('keeps pointing at the first attempt, so a third try compares with the first, and carries the tip of the try it was pressed on', () => {
    expect(tryAgainParams(retry)).toEqual({ questionId: 7, retryOf: 'a1', tipFrom: 'a2' });
    expect(tryAgainParams(thirdTry)).toEqual({ questionId: 7, retryOf: 'a1', tipFrom: 'a3' });
  });

  it('on a first attempt points at itself', () => {
    expect(tryAgainParams(firstAttempt)).toEqual({ questionId: 7, retryOf: 'a1', tipFrom: 'a1' });
  });
});
