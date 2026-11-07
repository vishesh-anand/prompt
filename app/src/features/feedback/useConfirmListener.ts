import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { Answer } from '@/lib/schemas/answer';
import { supabase } from '@/lib/supabase';

// "That's what I meant" (true) or "Not quite" (false) under what the AI listener understood. Tapping the chosen one
// again undoes it (null). The database lets the phone change this one column on its own answers (like
// feedback_flagged). The screen shows the tap at once; the realtime update that follows reloads the row anyway.
export function nextConfirmation(current: boolean | null, tapped: boolean): boolean | null {
  return current === tapped ? null : tapped;
}

export function useConfirmListener(answerId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['answer', answerId];

  return useMutation({
    mutationFn: async (value: boolean | null) => {
      const { error } = await supabase.from('answers').update({ listener_confirmed: value }).eq('id', answerId);
      if (error) throw error;
    },
    onMutate: async (value) => {
      await queryClient.cancelQueries({ queryKey });
      const before = queryClient.getQueryData<Answer>(queryKey);
      if (before) queryClient.setQueryData<Answer>(queryKey, { ...before, listener_confirmed: value });
      return { before };
    },
    // Didn't save: show what is really saved again.
    onError: (_error, _value, context) => {
      if (context?.before) queryClient.setQueryData(queryKey, context.before);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
}
