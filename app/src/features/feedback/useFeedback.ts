import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAnswer } from '@/features/answers/useAnswer';

import { DailyLimitError, useProcessAnswer } from './useProcessAnswer';

// If the answer sits at the same stage this long, the server run was probably cut off. Offer a retry.
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

  // "Stuck" is remembered against the stage and attempt it was seen at, so any progress or retry clears it.
  const [attempt, setAttempt] = useState(0);
  const waiting = status === 'uploaded' || status === 'transcribed';
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

  const metrics = answer.data?.metrics ?? null;
  const done = status === 'measured' || status === 'judged' || status === 'coached';

  let view: FeedbackView = 'listening';
  if (process.error instanceof DailyLimitError) view = 'limit';
  else if (status === 'failed' || process.isError || (waiting && stuckKey === waitingKey)) view = 'problem';
  else if (done && metrics) view = metrics.wordCount === 0 ? 'noWords' : 'ready';

  // DESIGN.md: a soft tap when feedback appears.
  useEffect(() => {
    if (view === 'ready') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
  }, [view]);

  return { answer, view, metrics, retry };
}
