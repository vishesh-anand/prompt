import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

const linkSeconds = 60 * 60;

// The recordings bucket is private, so playback uses a link that works for an hour.
export function useRecordingUrl(audioPath: string | undefined) {
  return useQuery({
    queryKey: ['recording-url', audioPath],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('recordings').createSignedUrl(audioPath ?? '', linkSeconds);
      if (error) throw error;
      return data.signedUrl;
    },
    enabled: audioPath !== undefined,
    staleTime: (linkSeconds * 1000) / 2,
  });
}
