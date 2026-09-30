import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, Text, space } from '@/design';
import { RecordingCircle } from '@/features/recording/RecordingCircle';
import { setLastTake } from '@/features/recording/lastTake';
import { question } from '@/features/recording/question';
import { tooShortLength } from '@/features/recording/tooShortLength';
import { useMicPermission } from '@/features/recording/useMicPermission';
import { useRecording } from '@/features/recording/useRecording';

export default function Record() {
  const router = useRouter();
  const mic = useMicPermission();
  const { phase, level, take, failed, toggle, reset } = useRecording();
  const isRecording = phase === 'recording';

  useEffect(() => {
    if (take && !take.tooShort) {
      setLastTake(take);
      router.replace('/replay');
    }
  }, [take, router]);

  return (
    <Screen>
      {/* A stray back-swipe shouldn't cut an answer short. */}
      <Stack.Screen options={{ gestureEnabled: phase === 'idle' }} />
      <Text variant="question">{question}</Text>
      <View style={styles.center}>
        {mic.status === 'denied' ? (
          <View style={styles.message}>
            <Text variant="body">{"Prompt can't hear you yet. Turn on the microphone in Settings, then come back."}</Text>
            <Button label="Open Settings" onPress={mic.openSettings} />
          </View>
        ) : mic.status === 'granted' && take?.tooShort ? (
          <View style={styles.message}>
            <Text variant="body">{`${tooShortLength(take.durationMs)} Say a bit more: aim for at least 10.`}</Text>
            <Button label="Try again" onPress={reset} />
          </View>
        ) : mic.status === 'granted' ? (
          <>
            <RecordingCircle recording={isRecording} level={level} onPress={toggle} />
            <View style={styles.hint}>
              {failed ? (
                <Text variant="body" color="textSecondary">
                  {"That didn't work, and nothing was kept. Tap the circle to try again."}
                </Text>
              ) : phase === 'idle' ? (
                <Text variant="label">Tap the circle to start.</Text>
              ) : null}
            </View>
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  message: { alignSelf: 'stretch', gap: space.xl },
  hint: { marginTop: space.xl, minHeight: space.xxxl },
});
