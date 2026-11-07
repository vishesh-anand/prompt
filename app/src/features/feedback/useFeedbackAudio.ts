import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { useRecordingUrl } from '@/features/answers/useRecordingUrl';
import { useReplay } from '@/features/recording/useReplay';

// The feedback screen's one audio player, shared by the Play row, the time buttons and the sheets, so two never play at
// once. It pauses when the screen loses focus (the before-and-after screen opens on top of it, or the recorder takes
// over the audio session for a retry), and the caller pauses it before leaving.
// `firstWordAtSeconds` is where the first word starts in the recording: map times count from there. Without it (a map
// saved before step D2), moments can't be played, so `playMoment` is null and no time buttons show.
export function useFeedbackAudio(audioPath: string | undefined, firstWordAtSeconds: number | undefined) {
  const url = useRecordingUrl(audioPath);
  const { playing, toggle, playFrom, pause } = useReplay(url.data ?? null);

  // The latest pause, for the moment the screen loses focus.
  const pauseRef = useRef(pause);
  useEffect(() => {
    pauseRef.current = pause;
  });
  useFocusEffect(useCallback(() => () => pauseRef.current(), []));

  const ready = url.data !== undefined;
  const playMoment = ready && firstWordAtSeconds !== undefined ? (atSeconds: number) => void playFrom(atSeconds + firstWordAtSeconds) : null;

  return { ready, playing, toggle: () => void toggle(), playMoment, pause };
}
