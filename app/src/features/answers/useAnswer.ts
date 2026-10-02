import { useQuery } from '@tanstack/react-query';

import { answerSchema } from '@/lib/schemas/answer';
import { supabase } from '@/lib/supabase';

export function useAnswer(answerId: string) {
  return useQuery({
    queryKey: ['answer', answerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('answers')
        .select('id, user_id, question_id, audio_path, duration_ms, status')
        .eq('id', answerId)
        .single();
      if (error) throw error;
      return answerSchema.parse(data);
    },
  });
}
