import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { z } from 'zod';

import { useSession } from '@/features/auth/AuthProvider';
import { processAnswer } from '@/features/feedback/useProcessAnswer';
import { unfinishedAnswerSchema } from '@/lib/schemas/answer';
import { supabase } from '@/lib/supabase';

// Transcribing takes seconds, so an answer still unfinished after this long never ran or was cut off.
// Waiting this long also means we never start an answer that is being processed right now.
const unfinishedAfterMs = 2 * 60_000;

// Only answers from the last day are picked up again. An older one is left alone: it is too late to help the person,
// and it could otherwise reprocess a whole backlog (and spend money) the first time the app opens after an update.
const resumeWindowMs = 24 * 60 * 60_000;

// If the app closed before the feedback screen could start processing (or while it was running),
// the answer would sit unfinished. Whenever the app opens or comes back to the front, restart those from the last
// 24 hours quietly. The server picks up from the last stage it saved.
export function useResumeAnswers() {
  const queryClient = useQueryClient();
  const userId = useSession().session?.user.id;
  const restarted = useRef(new Map<string, number>());

  const unfinished = useQuery({
    queryKey: ['unfinished', userId],
    enabled: userId !== undefined,
    queryFn: async () => {
      const now = Date.now();
      const { data, error } = await supabase
        .from('answers')
        .select('id')
        .in('status', ['uploaded', 'transcribed', 'measured', 'judged'])
        .lt('created_at', new Date(now - unfinishedAfterMs).toISOString())
        .gte('created_at', new Date(now - resumeWindowMs).toISOString());
      if (error) throw error;
      return z.array(unfinishedAnswerSchema).parse(data);
    },
  });

  // AppState reports the app coming to the front ('active') as well as going to the background.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void queryClient.invalidateQueries({ queryKey: ['unfinished'] });
    });
    return () => subscription.remove();
  }, [queryClient]);

  useEffect(() => {
    for (const { id } of unfinished.data ?? []) {
      const lastStarted = restarted.current.get(id);
      if (lastStarted !== undefined && Date.now() - lastStarted < unfinishedAfterMs) continue;
      restarted.current.set(id, Date.now());
      // A daily-limit reply (or any other failure) is fine to ignore: this is a quiet best effort.
      processAnswer(id).catch(() => {});
    }
  }, [unfinished.data]);
}
