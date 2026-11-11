import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { questionSchema } from '@/lib/schemas/question';
import { supabase } from '@/lib/supabase';

// All active questions, in the order they are asked. Row Level Security already hides the inactive ones.
export function useQuestions() {
  return useQuery({
    queryKey: ['questions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('questions').select('id, category, text, wants_direct_answer').eq('active', true).order('id');
      if (error) throw error;
      return z.array(questionSchema).parse(data);
    },
  });
}
