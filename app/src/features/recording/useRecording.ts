import { RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { recordingMotion } from '@/design';

import { setLastTake } from './lastTake';
import { maxAnswerMs, minAnswerMs } from './limits';

export type RecordingPhase = 'idle' | 'starting' | 'recording' | 'stopping';

export type Take = { uri: string; durationMs: number; tooShort: boolean };

// Metering on: the recorder reports how loud you are, which drives the circle.
const recorderOptions = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

// Decibels (negative, 0 is loudest) to 0..1, clamped and curved.
function toLevel(db: number | undefined): number {
  if (db === undefined) return 0;
  const { meterFloorDb, meterCeilingDb, levelCurve } = recordingMotion;
  const linear = Math.min(1, Math.max(0, (db - meterFloorDb) / (meterCeilingDb - meterFloorDb)));
  return linear ** levelCurve;
}

export function useRecording() {
  const recorder = useAudioRecorder(recorderOptions);
  const state = useAudioRecorderState(recorder, recordingMotion.meterIntervalMs);
  const [phase, setPhase] = useState<RecordingPhase>('idle');
  const [take, setTake] = useState<Take | null>(null);
  const [failed, setFailed] = useState(false);
  // The phase, readable from timers and cleanups without re-running them on every render. It also
  // ignores taps while a start or stop is in flight: only 'idle' can start and only 'recording' can stop.
  const phaseRef = useRef<RecordingPhase>('idle');
  // Last known file and length, for when the screen goes away and the recorder can't be asked.
  const latest = useRef<{ uri: string | null; durationMs: number }>({ uri: null, durationMs: 0 });

  function changePhase(next: RecordingPhase) {
    phaseRef.current = next;
    setPhase(next);
  }

  async function start() {
    changePhase('starting');
    setFailed(false);
    try {
      // iOS has one audio mode for the whole app. This one allows the microphone.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      latest.current = { uri: recorder.uri, durationMs: 0 };
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      changePhase('recording');
    } catch {
      setFailed(true);
      changePhase('idle');
    }
  }

  async function stop() {
    if (phaseRef.current !== 'recording') return;
    changePhase('stopping');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Read the length first: the recorder may reset it once stopped.
    const durationMs = recorder.getStatus().durationMillis;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (uri) setTake({ uri, durationMs, tooShort: durationMs < minAnswerMs });
      else setFailed(true);
    } catch {
      setFailed(true);
    }
    try {
      // Back to playback mode, or replay comes out of the quiet earpiece.
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {
      // The take is already saved; replay may just be quieter.
    }
    changePhase('idle');
  }

  function toggle() {
    if (phaseRef.current === 'idle') void start();
    else void stop();
  }

  function reset() {
    setTake(null);
    setFailed(false);
  }

  // Keep the last known file and length up to date. A plain assignment: no re-subscribing.
  useEffect(() => {
    latest.current = { uri: state.url ?? latest.current.uri, durationMs: state.durationMillis };
  }, [state.url, state.durationMillis]);

  // Auto-stop at the limit, same path as a tap. One timer per recording.
  const onLimitReached = useEffectEvent(() => void stop());
  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setTimeout(() => onLimitReached(), maxAnswerMs);
    return () => clearTimeout(timer);
  }, [phase]);

  // Leaving the app mid-answer keeps what you said so far. Subscribed once.
  const onBackground = useEffectEvent(() => void stop());
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') onBackground();
    });
    return () => subscription.remove();
  }, []);

  // The screen goes away mid-answer: stop, and remember the recording so it isn't lost.
  // expo-audio also stops and closes the file when it releases the recorder, so this order doesn't matter.
  useEffect(
    () => () => {
      if (phaseRef.current !== 'recording') return;
      const { uri, durationMs } = latest.current;
      if (uri) setLastTake({ uri, durationMs, tooShort: durationMs < minAnswerMs });
      void (async () => {
        try {
          await recorder.stop();
        } catch {
          // Already released; the file was closed with it.
        }
        try {
          await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        } catch {
          // Only affects how loud replay is.
        }
      })();
    },
    [recorder],
  );

  return {
    phase,
    level: phase === 'recording' ? toLevel(state.metering) : 0,
    take,
    failed,
    toggle,
    reset,
  };
}
