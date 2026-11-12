import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';

import { useAnswer } from '@/features/answers/useAnswer';
import { useFeedbackAudio } from '@/features/feedback/useFeedbackAudio';
import { tryAgainParams } from '@/features/feedback/nextAction';
import { useHistory } from '@/features/history/useHistory';
import { useQuestion } from '@/features/questions/useQuestion';

import { compareAttempts } from './compareAttempts';
import type { CompareData, TryView } from './CompareView';
import { isFirstRetry, previousTry, tryNumber } from './tries';

export type CompareScreenView = 'loading' | 'unavailable' | 'questionError' | 'ready';

// Everything the before-and-after needs: the latest try and the first try it points at, the question (its category,
// and whether it wanted a direct answer, which decides what the first tip was about), and the history Home already
// loaded (which try this is, and whether it is the first retry ever). A third try compares with the first too, because
// retry_of always names the first attempt.
//
// Shared with the feedback screen underneath (the latest try's): the ['answer', id] query and the recording link.
// This screen has its own player for "Play your second try"; the one underneath pauses when this screen covers it.
export function useCompare(answerId: string) {
  const latest = useAnswer(answerId);
  const first = useAnswer(latest.data?.retry_of ?? null);
  const question = useQuestion(latest.data?.question_id);
  const history = useHistory();
  // The try whose tip this one carried (the first try, or on a third try the second). Usually already cached.
  const carriedId = latest.data ? previousTry(history.data, latest.data) : null;
  const carried = useAnswer(carriedId === latest.data?.retry_of ? null : carriedId);
  const audio = useFeedbackAudio(latest.data?.audio_path, undefined);

  const a = first.data;
  const b = latest.data;

  let view: CompareScreenView = 'loading';
  let data: CompareData | null = null;
  // The carried try is the first one unless history says otherwise; while it loads, wait for it.
  const c = carriedId === b?.retry_of ? a : carried.data;
  if (latest.isError || first.isError || (b && b.retry_of === null)) view = 'unavailable';
  // The question is only needed for its category and whether it wanted a direct answer: a failed load is a calm retry,
  // not a reason to leave.
  else if (question.isError) view = 'questionError';
  else if (a && b && question.data && (c || carried.isError)) {
    const attempt = (x: typeof a) =>
      x.map && x.metrics ? { map: x.map, metrics: x.metrics, tip: x.coaching?.tip, focusKnown: x.coaching?.betterSteps !== undefined } : null;
    const firstTry = attempt(a);
    const latestTry = attempt(b);
    // A carried try that failed to load, or has no map, falls back to the first try.
    const carriedTry = (c && attempt(c)) ?? firstTry;
    const tryView = (map: NonNullable<typeof a.map>, speakingSeconds: number, durationMs: number): TryView => ({ map, speakingSeconds, durationSeconds: durationMs / 1000 });
    data = {
      category: question.data.category,
      tryNumber: tryNumber(history.data, b),
      firstRetry: isFirstRetry(history.data, b),
      tries:
        firstTry && latestTry && carriedTry
          ? {
              first: tryView(firstTry.map, firstTry.metrics.speakingSeconds, a.duration_ms),
              latest: tryView(latestTry.map, latestTry.metrics.speakingSeconds, b.duration_ms),
              result: compareAttempts(firstTry, latestTry, question.data.wants_direct_answer, carriedTry),
            }
          : null,
    };
    view = 'ready';
  }

  // DESIGN.md: the success pattern only when the tip worked. Once per time the screen shows.
  const worked = data?.tries?.result.status === 'worked';
  useEffect(() => {
    if (worked) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [worked]);

  return { view, data, audio, retryQuestion: () => void question.refetch(), tryAgain: b ? tryAgainParams(b) : null };
}
