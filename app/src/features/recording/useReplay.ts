import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

// Play or pause a saved recording, or play it from a moment. After it finishes, the next tap starts from the beginning.
// `uri` is null while the link to the recording is still loading. One player per screen: everything on the feedback
// screen that plays (the Play row, the time buttons, the sheets) shares it, so two never play at once.
export function useReplay(uri: string | null) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);

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
    if (status.playing) player.pause();
  }

  return { playing: status.playing, toggle, playFrom, pause };
}
