import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { useSession } from '@/features/auth/AuthProvider';
import { historyRowSchema } from '@/lib/schemas/history';
import { supabase } from '@/lib/supabase';

// Every answer you have given, newest first. Streaks and "which questions have I seen" are worked out from this
// (ARCHITECTURE.md: no separate tables). Refreshed after every upload (see useSaveAnswer, usePendingAnswers).
export function useHistory() {
  const userId = useSession().session?.user.id;
  return useQuery({
    queryKey: ['history', userId],
    enabled: userId !== undefined,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('answers')
        .select('id, question_id, retry_of, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return z.array(historyRowSchema).parse(data);
    },
  });
}
