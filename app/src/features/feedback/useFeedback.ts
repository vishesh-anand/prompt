import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAnswer } from '@/features/answers/useAnswer';
import { stoppedByTimeLimit } from '@/features/recording/limits';

import { nextAction } from './nextAction';
import { DailyLimitError, useProcessAnswer } from './useProcessAnswer';

// If the answer sits at the same stage this long, the server run was probably cut off. Offer a retry. Keep it above
// the longest a stage can take (two model calls of 20 seconds, modelDeadlineMs in supabase/functions/process-answer).
export const stuckAfterMs = 45_000;

export type FeedbackView = 'listening' | 'ready' | 'noWords' | 'problem' | 'limit';

// Everything the feedback screen needs: start processing once, follow the answer as stages are saved,
// and decide what to show.
export function useFeedback(answerId: string) {
  const answer = useAnswer(answerId);
  const process = useProcessAnswer(answerId);
  const { mutate: startProcessing } = process;
  const status = answer.data?.status;

  // Both ways in (straight after recording, or Home's retry for a leftover upload) land here with a
  // freshly uploaded answer, so this is the one place that starts processing.
  const started = useRef(false);
  useEffect(() => {
    if (status === 'uploaded' && !started.current) {
      started.current = true;
      startProcessing();
    }
  }, [status, startProcessing]);

  const metrics = answer.data?.metrics ?? null;
  const judgement = answer.data?.judgement ?? null;
  const coaching = answer.data?.coaching ?? null;

  // An answer with no words stops after the measuring stage, and that is as far as it goes.
  const noWords = metrics?.wordCount === 0;
  const finished = status === 'coached' || noWords;

  // "Stuck" is remembered against the stage and attempt it was seen at, so any progress or retry clears it.
  const [attempt, setAttempt] = useState(0);
  const waiting = status !== undefined && status !== 'failed' && !finished;
  const waitingKey = `${status}:${attempt}`;
  const [stuckKey, setStuckKey] = useState<string | null>(null);
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setStuckKey(waitingKey), stuckAfterMs);
    return () => clearTimeout(timer);
  }, [waiting, waitingKey]);

  const retry = useCallback(() => {
    setAttempt((n) => n + 1);
    startProcessing();
  }, [startProcessing]);

  const problem = status === 'failed' || process.isError || (waiting && stuckKey === waitingKey);

  // Results show as soon as the counted numbers are saved, even if a later stage then stalls.
  let view: FeedbackView = 'listening';
  if (process.error instanceof DailyLimitError) view = 'limit';
  else if (metrics) view = noWords ? 'noWords' : 'ready';
  else if (problem) view = 'problem';

  // Some results are on screen but the rest didn't finish.
  const stalled = view === 'ready' && problem && !finished;

  // DESIGN.md: a soft tap when feedback appears.
  useEffect(() => {
    if (view === 'ready') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
  }, [view]);

  const timeRanOut = answer.data ? stoppedByTimeLimit(answer.data.duration_ms, answer.data.time_limit_ms) : false;

  const isFinished = finished && view === 'ready';
  // The one accent button once everything is in: try again after a first attempt, see before and after after a retry.
  const next = isFinished && answer.data ? nextAction(answer.data) : null;

  return { answer, view, metrics, judgement, coaching, timeRanOut, finished: isFinished, next, stalled, retry };
}
