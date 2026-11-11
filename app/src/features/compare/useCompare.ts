import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';

import { useAnswer } from '@/features/answers/useAnswer';
import { tryAgainParams } from '@/features/feedback/nextAction';
import { useQuestion } from '@/features/questions/useQuestion';

import { compareAttempts, type Attempt } from './compareAttempts';

export type CompareView = 'loading' | 'unavailable' | 'noScores' | 'ready';

// Loads the latest try and the first try it points at, and compares them. A third try compares with the first too,
// because retry_of always names the first attempt.
export function useCompare(answerId: string) {
  const latest = useAnswer(answerId);
  const firstId = latest.data?.retry_of ?? null;
  const first = useAnswer(firstId);
  // Whether the question wanted a direct answer decides what the first try's tip was about (tipKind).
  const question = useQuestion(latest.data?.question_id);

  const a = first.data;
  const b = latest.data;

  let view: CompareView = 'loading';
  let result: ReturnType<typeof compareAttempts> | null = null;
  if (latest.isError || first.isError || (b && b.retry_of === null)) view = 'unavailable';
  else if (a && b) {
    if (a.metrics && a.map && b.metrics && b.map) {
      // Wait for the question: without it the first try's tip could be read wrongly.
      if (question.data) {
        const firstTry: Attempt = { map: a.map, metrics: a.metrics, tip: a.coaching?.tip };
        const latestTry: Attempt = { map: b.map, metrics: b.metrics, tip: b.coaching?.tip };
        result = compareAttempts(firstTry, latestTry, question.data.wants_direct_answer);
        view = 'ready';
      } else if (question.isError) {
        view = 'unavailable';
      }
    } else {
      view = 'noScores';
    }
  }

  // DESIGN.md: the success pattern only when the tip worked. Once per time the screen shows.
  const improved = result?.status === 'worked';
  useEffect(() => {
    if (improved) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [improved]);

  return { view, result, tryAgain: b ? tryAgainParams(b) : null };
}
