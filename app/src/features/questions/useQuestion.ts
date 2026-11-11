import { useQuery } from '@tanstack/react-query';

import { questionSchema } from '@/lib/schemas/question';
import { supabase } from '@/lib/supabase';

// One question by id. Home picks the question and passes its id on (a retry asks the same one again).
export function useQuestion(questionId: number | undefined) {
  return useQuery({
    queryKey: ['question', questionId],
    enabled: questionId !== undefined,
    queryFn: async () => {
      const { data, error } = await supabase.from('questions').select('id, category, text, wants_direct_answer').eq('id', questionId).single();
      if (error) throw error;
      return questionSchema.parse(data);
    },
  });
}
