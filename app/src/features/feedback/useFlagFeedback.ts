import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

// "This feedback is wrong": marks the answer so we can see how often the coach gets it wrong.
// The database lets the phone change this one column on its own answers and nothing else.
export function useFlagFeedback(answerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('answers').update({ feedback_flagged: true }).eq('id', answerId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['answer', answerId] }),
  });
}
