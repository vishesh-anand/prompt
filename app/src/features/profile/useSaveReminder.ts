import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth/AuthProvider';
import { askForReminderPermission } from '@/features/reminders/scheduleReminders';
import { formatTime, type TimeOfDay } from '@/features/reminders/timeOfDay';
import type { Profile } from '@/lib/schemas/profile';
import { supabase } from '@/lib/supabase';

// The phone's own timezone, as a name like "America/New_York". The server uses it to find the start of your day.
function phoneTimezone(): string | null {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
}

// First-time setup (and, in step 9, Settings): ask for permission to remind you, save the time, and put it straight into
// the cache so the rest of the app sees you as set up without waiting for a reload.
export function useSaveReminder() {
  const queryClient = useQueryClient();
  const userId = useSession().session?.user.id;

  return useMutation({
    mutationFn: async (time: TimeOfDay): Promise<Profile> => {
      // Saying no is fine: the time is still saved and the app works, there just won't be reminders.
      await askForReminderPermission().catch(() => false);
      const next = { reminder_time: formatTime(time), timezone: phoneTimezone() };
      const { error } = await supabase.from('profiles').update(next).eq('id', userId ?? '');
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => queryClient.setQueryData(['profile', userId], next),
  });
}
