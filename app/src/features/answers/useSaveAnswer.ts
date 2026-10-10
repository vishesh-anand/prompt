import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { keepAnswer, type PendingAnswer } from './pendingAnswers';
import { uploadAnswer } from './uploadAnswer';

type Take = { uri: string; durationMs: number; userId: string; questionId: number; retryOf: string | null };

// Keep the take on the phone, upload it, create the answer row. If anything fails the take stays
// on the phone, and `retry` uploads that same take again: no second copy, no second row.
export function useSaveAnswer() {
  const queryClient = useQueryClient();
  const kept = useRef<PendingAnswer | null>(null);
  const lastTake = useRef<Take | null>(null);

  const mutation = useMutation({
    mutationFn: (take: Take) => {
      kept.current ??= keepAnswer(take);
      return uploadAnswer(kept.current);
    },
    onSettled: () => Promise.all([queryClient.invalidateQueries({ queryKey: ['pending'] }), queryClient.invalidateQueries({ queryKey: ['history'] })]),
  });

  return {
    status: mutation.status,
    answerId: mutation.data,
    save(take: Take) {
      lastTake.current = take;
      mutation.mutate(take);
    },
    retry() {
      if (lastTake.current) mutation.mutate(lastTake.current);
    },
    // For a take that arrives with nobody watching (you left the screen mid-answer): just keep it safe.
    keepForLater(take: Take) {
      keepAnswer(take);
      void queryClient.invalidateQueries({ queryKey: ['pending'] });
      void queryClient.invalidateQueries({ queryKey: ['history'] });
    },
  };
}
