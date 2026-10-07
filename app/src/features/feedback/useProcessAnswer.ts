import { useMutation } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

export class DailyLimitError extends Error {}

// Asks the server to run the pipeline on this answer. The server replies at once and keeps working,
// so this only says "started"; the results arrive through useAnswer. Safe to call again for a stuck
// or failed answer: the server picks up from the last stage it saved.
export async function processAnswer(answerId: string) {
  const { error } = await supabase.functions.invoke('process-answer', { body: { answerId } });
  if (error) {
    if (error instanceof FunctionsHttpError && error.context.status === 429) throw new DailyLimitError();
    throw error;
  }
}

export function useProcessAnswer(answerId: string) {
  return useMutation({ mutationFn: () => processAnswer(answerId) });
}
