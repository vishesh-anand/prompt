import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';

import { useAnswer } from '@/features/answers/useAnswer';
import { tryAgainParams } from '@/features/feedback/nextAction';

import { compareAttempts, type Attempt } from './compareAttempts';

export type CompareView = 'loading' | 'unavailable' | 'noScores' | 'ready';

// Loads the latest try and the first try it points at, and compares them. A third try compares with the first too,
// because retry_of always names the first attempt.
export function useCompare(answerId: string) {
  const latest = useAnswer(answerId);
  const firstId = latest.data?.retry_of ?? null;
  const first = useAnswer(firstId);

  const a = first.data;
  const b = latest.data;

  let view: CompareView = 'loading';
  let result: ReturnType<typeof compareAttempts> | null = null;
  if (latest.isError || first.isError || (b && b.retry_of === null)) view = 'unavailable';
  else if (a && b) {
    if (a.metrics && a.judgement && b.metrics && b.judgement) {
      const firstTry: Attempt = { metrics: a.metrics, judgement: a.judgement, durationMs: a.duration_ms, tip: a.coaching?.tip };
      const latestTry: Attempt = { metrics: b.metrics, judgement: b.judgement, durationMs: b.duration_ms, tip: b.coaching?.tip };
      result = compareAttempts(firstTry, latestTry);
      view = 'ready';
    } else {
      view = 'noScores';
    }
  }

  // DESIGN.md: the success pattern when you improved on retry. Once per time the screen shows.
  const improved = result?.summary.improved === true;
  useEffect(() => {
    if (improved) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [improved]);

  return { view, result, tryAgain: b ? tryAgainParams(b) : null };
}
