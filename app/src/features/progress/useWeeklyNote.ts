import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/features/auth/AuthProvider';
import { localDayKey } from '@/features/streak/streak';
import { weeklyNoteReplySchema } from '@/lib/schemas/weeklyNote';
import { supabase } from '@/lib/supabase';

import { weekStart } from './week';

// Asks the server for this week's note. Cheap to call often: the server only asks the AI when the week has a new
// practice day since the saved note, and otherwise sends the saved one back.
export function useWeeklyNote(now: Date) {
  const userId = useSession().session?.user.id;
  const week = localDayKey(weekStart(now));
  return useQuery({
    // The week is in the key, so last week's note is never shown as this week's.
    queryKey: ['weeklyNote', userId, week],
    enabled: userId !== undefined,
    // No automatic retry: each call can be a paid model call, and showing the tab again is the retry.
    retry: false,
    // While another request is writing the note, look again every so often so it appears without leaving the tab.
    refetchInterval: (query) => (query.state.data?.writing ? 20_000 : false),
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('weekly-note');
      if (error) throw error;
      return weeklyNoteReplySchema.parse(data);
    },
  });
}
