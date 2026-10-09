import { useQuery } from '@tanstack/react-query';

import { questionSchema } from '@/lib/schemas/question';
import { supabase } from '@/lib/supabase';

// A given question (a retry asks the same one again). With no id, a placeholder until Home picks a
// category and the question bank arrives (build step 7): the first active question.
export function useQuestion(questionId?: number) {
  return useQuery({
    queryKey: ['question', questionId ?? 'first'],
    queryFn: async () => {
      const base = supabase.from('questions').select('id, category, text');
      const { data, error } =
        questionId === undefined
          ? await base.eq('active', true).order('id').limit(1).single()
          : await base.eq('id', questionId).single();
      if (error) throw error;
      return questionSchema.parse(data);
    },
  });
}
