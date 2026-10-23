import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { answerSchema } from '@/lib/schemas/answer';
import { supabase } from '@/lib/supabase';

let channelCount = 0;

// One answer, kept fresh: whenever the pipeline saves a stage, Supabase tells us and we load the row again.
// With no id (a first attempt that isn't known yet) it waits and loads nothing.
export function useAnswer(answerId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = ['answer', answerId];

  useEffect(() => {
    if (answerId === null) return;
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ['answer', answerId] });
    // Each subscription gets its own channel name: Supabase hands back the existing channel for a repeated name, and a
    // channel that is already subscribed refuses new listeners. The feedback and compare screens both watch one answer.
    const channel = supabase
      .channel(`answer:${answerId}:${(channelCount += 1)}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'answers', filter: `id=eq.${answerId}` }, refresh)
      // A stage may have been saved between the first load and the moment we started listening.
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') refresh();
      });
    return () => void supabase.removeChannel(channel);
  }, [answerId, queryClient]);

  return useQuery({
    queryKey,
    enabled: answerId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('answers')
        .select('id, user_id, question_id, retry_of, audio_path, duration_ms, time_limit_ms, status, metrics, judgement, coaching, feedback_flagged')
        .eq('id', answerId)
        .single();
      if (error) throw error;
      return answerSchema.parse(data);
    },
  });
}
