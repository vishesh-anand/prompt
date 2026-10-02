import { useEffect } from 'react';

import { useSession } from '@/features/auth/AuthProvider';
import { useRecording } from '@/features/recording/useRecording';
import { useQuestion } from '@/features/questions/useQuestion';

import { useSaveAnswer } from './useSaveAnswer';

// One answer from start to saved: show the question, record, then keep the take on the phone and upload it.
export function useAnswerFlow() {
  const userId = useSession().session?.user.id;
  const question = useQuestion();
  const questionId = question.data?.id;
  const save = useSaveAnswer();

  const recording = useRecording({
    onLeftMidAnswer: (take) => {
      if (userId && questionId !== undefined) save.keepForLater({ ...take, userId, questionId });
    },
  });

  // Takes under 10 seconds aren't scored, so they aren't kept or uploaded either.
  const { take } = recording;
  const readyTake = take && !take.tooShort ? take : null;
  useEffect(() => {
    if (readyTake && userId && questionId !== undefined && save.status === 'idle') {
      save.save({ uri: readyTake.uri, durationMs: readyTake.durationMs, userId, questionId });
    }
  }, [readyTake, userId, questionId, save]);

  return {
    question,
    recording,
    saveStatus: save.status,
    answerId: save.answerId,
    retry: save.retry,
  };
}
