import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { useSession } from '@/features/auth/AuthProvider';
import { localDayKey } from '@/features/streak/streak';
import { weekAnswerSchema } from '@/lib/schemas/progress';
import { supabase } from '@/lib/supabase';

import { weekStart } from './week';

const columns = 'id, retry_of, created_at, duration_ms, metrics, judgement';

// This week's answers with their saved numbers: a bounded query, so it never grows with your history.
export function useWeekAnswers(now: Date) {
  const userId = useSession().session?.user.id;
  const start = weekStart(now);
  return useQuery({
    queryKey: ['progress', userId, 'week', localDayKey(start)],
    enabled: userId !== undefined,
    queryFn: async () => {
      const { data, error } = await supabase.from('answers').select(columns).gte('created_at', start.toISOString()).order('created_at');
      if (error) throw error;
      return z.array(weekAnswerSchema).parse(data);
    },
  });
}

// Your starting point: a plain query, not useAnswer, so no realtime channel is opened for it.
export function useBaseline(baselineId: string | null | undefined) {
  const userId = useSession().session?.user.id;
  return useQuery({
    queryKey: ['progress', userId, 'baseline', baselineId],
    enabled: userId !== undefined && !!baselineId,
    queryFn: async () => {
      const { data, error } = await supabase.from('answers').select(columns).eq('id', baselineId ?? '').single();
      if (error) throw error;
      return weekAnswerSchema.parse(data);
    },
  });
}
