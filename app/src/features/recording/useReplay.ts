import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

// Play or pause a saved recording. After it finishes, the next tap starts from the beginning.
// `uri` is null while the link to the recording is still loading.
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

  return { playing: status.playing, toggle };
}
