import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { useSession } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

import { isFirstRetry, previousTry, tryNumber } from './tries';

const retryRowSchema = z.object({ id: z.string(), created_at: z.string() });

// Which try an answer is, the try whose tip it carried, and whether it is the person's first retry ever. Two small exact
// queries (the retries of this question, and the id of the earliest retry), so the 1000-row cap on the full history
// can't change them. Both refetch when a screen using them mounts, so a retry saved a moment ago is counted.
export function useTries(answer: { id: string; retry_of: string | null } | undefined) {
  const userId = useSession().session?.user.id;
  const firstId = answer?.retry_of ?? null;

  const retries = useQuery({
    queryKey: ['tries', firstId],
    enabled: firstId !== null,
    queryFn: async () => {
      const { data, error } = await supabase.from('answers').select('id, created_at').eq('retry_of', firstId).order('created_at', { ascending: true });
      if (error) throw error;
      return z.array(retryRowSchema).parse(data);
    },
  });

  const firstRetry = useQuery({
    queryKey: ['first-retry', userId],
    enabled: userId !== undefined && firstId !== null,
    queryFn: async () => {
      const { data, error } = await supabase.from('answers').select('id').not('retry_of', 'is', null).order('created_at', { ascending: true }).limit(1);
      if (error) throw error;
      return z.array(z.object({ id: z.string() })).parse(data)[0]?.id ?? null;
    },
  });

  return {
    tryNumber: answer ? tryNumber(retries.data, answer) : 1,
    previousTry: answer ? previousTry(retries.data, answer) : null,
    // Still loading: the carried try isn't known yet, so the screen waits rather than checking the wrong tip.
    loading: retries.isPending && firstId !== null,
    firstRetry: answer ? isFirstRetry(firstRetry.data, answer) : false,
  };
}
