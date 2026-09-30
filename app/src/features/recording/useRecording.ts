import { RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { recordingMotion } from '@/design';

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
  // Ignores taps while a start or stop is still in flight.
  const busy = useRef(false);

  async function start() {
    busy.current = true;
    setFailed(false);
    setPhase('starting');
    try {
      // iOS has one audio mode for the whole app. This one allows the microphone.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setPhase('recording');
    } catch {
      setFailed(true);
      setPhase('idle');
    } finally {
      busy.current = false;
    }
  }

  async function stop() {
    busy.current = true;
    setPhase('stopping');
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
    setPhase('idle');
    busy.current = false;
  }

  function toggle() {
    if (busy.current) return;
    if (phase === 'idle') void start();
    else if (phase === 'recording') void stop();
  }

  function reset() {
    setTake(null);
    setFailed(false);
  }

  // Auto-stop at the limit, same path as a tap.
  useEffect(() => {
    if (phase === 'recording' && !busy.current && state.durationMillis >= maxAnswerMs) void stop();
  });

  // Leaving the app mid-answer keeps what you said so far.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background' && phase === 'recording' && !busy.current) void stop();
    });
    return () => subscription.remove();
  });

  return {
    phase,
    level: phase === 'recording' ? toLevel(state.metering) : 0,
    take,
    failed,
    toggle,
    reset,
  };
}
