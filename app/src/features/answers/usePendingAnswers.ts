import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth/AuthProvider';

import { listPendingAnswers, type PendingAnswer } from './pendingAnswers';
import { uploadAnswer } from './uploadAnswer';

// Recordings still on the phone, waiting to upload. Home offers a retry for these.
export function usePendingAnswers() {
  const userId = useSession().session?.user.id;
  return useQuery({
    queryKey: ['pending', userId],
    queryFn: () => listPendingAnswers(userId ?? ''),
    enabled: userId !== undefined,
  });
}

export function useUploadPending() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pending: PendingAnswer) => uploadAnswer(pending),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['pending'] }),
  });
}
