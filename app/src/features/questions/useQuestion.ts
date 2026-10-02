import { useQuery } from '@tanstack/react-query';

import { questionSchema } from '@/lib/schemas/question';
import { supabase } from '@/lib/supabase';

// Placeholder until Home picks a category and the question bank arrives (build step 7):
// the first active question.
export function useQuestion() {
  return useQuery({
    queryKey: ['question', 'first'],
    queryFn: async () => {
      const { data, error } = await supabase.from('questions').select('id, category, text').eq('active', true).order('id').limit(1).single();
      if (error) throw error;
      return questionSchema.parse(data);
    },
  });
}
