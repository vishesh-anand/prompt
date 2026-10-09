import { useEffect } from 'react';

import { useSession } from '@/features/auth/AuthProvider';
import { useRecording } from '@/features/recording/useRecording';
import { useQuestion } from '@/features/questions/useQuestion';

import { useSaveAnswer } from './useSaveAnswer';

// One answer from start to saved: show the question, record, then keep the take on the phone and upload it.
// A retry arrives with the question to ask again and the first attempt it belongs to (route params are strings).
export function useAnswerFlow(params: { questionId?: string; retryOf?: string } = {}) {
  const userId = useSession().session?.user.id;
  const retryOf = params.retryOf ?? null;
  const question = useQuestion(params.questionId === undefined ? undefined : Number(params.questionId));
  const questionId = question.data?.id;
  const save = useSaveAnswer();

  const recording = useRecording({
    onLeftMidAnswer: (take) => {
      if (userId && questionId !== undefined) save.keepForLater({ ...take, userId, questionId, retryOf });
    },
  });

  // Takes under 10 seconds aren't scored, so they aren't kept or uploaded either.
  const { take } = recording;
  const readyTake = take && !take.tooShort ? take : null;
  useEffect(() => {
    if (readyTake && userId && questionId !== undefined && save.status === 'idle') {
      save.save({ uri: readyTake.uri, durationMs: readyTake.durationMs, userId, questionId, retryOf });
    }
  }, [readyTake, userId, questionId, retryOf, save]);

  return {
    question,
    recording,
    saveStatus: save.status,
    answerId: save.answerId,
    retry: save.retry,
  };
}
