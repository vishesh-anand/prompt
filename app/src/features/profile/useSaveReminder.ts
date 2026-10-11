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
    mutationFn: async (time: TimeOfDay): Promise<Pick<Profile, 'reminder_time' | 'timezone'>> => {
      // Saying no is fine: the time is still saved and the app works, there just won't be reminders.
      await askForReminderPermission().catch(() => false);
      const next = { reminder_time: formatTime(time), timezone: phoneTimezone() };
      // .select() hands back the rows that changed: none means the update matched nothing, which is a failure, not a save.
      const { data, error } = await supabase.from('profiles').update(next).eq('id', userId ?? '').select('id');
      if (error) throw error;
      if (data.length === 0) throw new Error('The profile was not updated');
      return next;
    },
    // Merged into what is cached, so the rest of the profile (the starting point) is kept.
    onSuccess: (next) => {
      const cached = queryClient.getQueryData<Profile>(['profile', userId]);
      // With nothing cached (the first load failed) there is no starting point to merge into: load the real profile.
      if (cached) queryClient.setQueryData<Profile>(['profile', userId], { ...cached, ...next });
      else void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
    },
  });
}
