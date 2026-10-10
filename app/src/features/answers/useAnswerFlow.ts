import { useEffect } from 'react';
import { z } from 'zod';

import { useSession } from '@/features/auth/AuthProvider';
import { useRecording } from '@/features/recording/useRecording';
import { useQuestion } from '@/features/questions/useQuestion';

import { useSaveAnswer } from './useSaveAnswer';

// One answer from start to saved: show the question, record, then keep the take on the phone and upload it.
// A retry arrives with the question to ask again and the first attempt it belongs to (route params are strings).
export function useAnswerFlow(params: { questionId?: string; retryOf?: string } = {}) {
  const userId = useSession().session?.user.id;
  // These can also arrive from a prompt:// link, so anything that isn't a whole number or an id is ignored.
  // A retry only counts together with its question, because the database wants both to match.
  const askedFor = z.coerce.number().int().positive().safeParse(params.questionId).data;
  const retryOf = askedFor === undefined ? null : (z.string().uuid().safeParse(params.retryOf).data ?? null);
  const question = useQuestion(askedFor);
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
    // Opened without a question (an old or mistyped link): nothing to record.
    missingQuestion: askedFor === undefined,
    question,
    recording,
    saveStatus: save.status,
    answerId: save.answerId,
    retry: save.retry,
  };
}
