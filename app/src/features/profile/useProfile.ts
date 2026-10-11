import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/features/auth/AuthProvider';
import { profileSchema } from '@/lib/schemas/profile';
import { supabase } from '@/lib/supabase';

// Your reminder time and timezone. A null reminder_time means first-time setup hasn't happened yet.
export function useProfile() {
  const userId = useSession().session?.user.id;
  return useQuery({
    queryKey: ['profile', userId],
    enabled: userId !== undefined,
    // A failed load shouldn't keep the splash screen up through three slow retries.
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('reminder_time, timezone, baseline_answer_id').single();
      if (error) throw error;
      return profileSchema.parse(data);
    },
  });
}
