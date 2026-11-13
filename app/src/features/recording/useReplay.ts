import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useRef } from 'react';

// Play or pause a saved recording, or play it from a moment. After it finishes, the next tap starts from the beginning.
// `uri` is null while the link to the recording is still loading. One player per screen: everything on the feedback
// screen that plays (the Play row, the time buttons, the sheets) shares it, so two never play at once.
export function useReplay(uri: string | null) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  // expo-audio frees the player when the screen closes. A pause that comes after that (the screen's "lost focus"
  // cleanup runs once it has closed, with `status.playing` still true from the last render) would touch a freed player
  // and crash, so it is skipped: freeing the player already stopped the sound. This effect sits after useAudioPlayer,
  // so on close it runs after the player is freed and before the callers' cleanups.
  const released = useRef(false);
  useEffect(() => {
    released.current = false;
    return () => {
      released.current = true;
    };
  }, [player]);

  async function toggle() {
    if (status.playing) {
      player.pause();
      return;
    }
    if (status.duration > 0 && status.currentTime >= status.duration - 0.1) await player.seekTo(0);
    player.play();
  }

  // Seconds into the recording file (a map time plus where the first word starts).
  async function playFrom(seconds: number) {
    await player.seekTo(Math.max(0, seconds));
    player.play();
  }

  // Before leaving the screen, or before the recorder takes over the audio session.
  function pause() {
    if (status.playing && !released.current) player.pause();
  }

  return { playing: status.playing, toggle, playFrom, pause };
}
