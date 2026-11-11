type AnswerRef = { id: string; question_id: number; retry_of: string | null };

// tipFrom is the answer whose tip the retry carries (the one the button was pressed on); retryOf is the first attempt.
export type TryAgainParams = { questionId: number; retryOf: string; tipFrom: string };

export type NextAction = { kind: 'tryAgain'; params: TryAgainParams } | { kind: 'compare'; answerId: string };

// retry_of always names the first attempt (ARCHITECTURE.md), so a third try still compares with the first.
export function tryAgainParams(answer: AnswerRef): TryAgainParams {
  return { questionId: answer.question_id, retryOf: answer.retry_of ?? answer.id, tipFrom: answer.id };
}

// The one accent button once feedback is ready: after a first attempt, go again; after a retry, see what changed.
export function nextAction(answer: AnswerRef): NextAction {
  return answer.retry_of === null
    ? { kind: 'tryAgain', params: tryAgainParams(answer) }
    : { kind: 'compare', answerId: answer.id };
}
