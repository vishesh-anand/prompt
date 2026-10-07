import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { answerSchema } from '@/lib/schemas/answer';
import { supabase } from '@/lib/supabase';

// One answer, kept fresh: whenever the pipeline saves a stage, Supabase tells us and we load the row again.
export function useAnswer(answerId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['answer', answerId];

  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ['answer', answerId] });
    const channel = supabase
      .channel(`answer:${answerId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'answers', filter: `id=eq.${answerId}` }, refresh)
      // A stage may have been saved between the first load and the moment we started listening.
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') refresh();
      });
    return () => void supabase.removeChannel(channel);
  }, [answerId, queryClient]);

  return useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('answers')
        .select('id, user_id, question_id, audio_path, duration_ms, status, metrics, judgement, coaching, feedback_flagged')
        .eq('id', answerId)
        .single();
      if (error) throw error;
      return answerSchema.parse(data);
    },
  });
}
