import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, Text, space } from '@/design';
import { useAnswerFlow } from '@/features/answers/useAnswerFlow';
import { RecordingCircle } from '@/features/recording/RecordingCircle';
import { tooShortLength } from '@/features/recording/tooShortLength';
import { useMicPermission } from '@/features/recording/useMicPermission';

export default function Record() {
  const router = useRouter();
  const mic = useMicPermission();
  const { question, recording, saveStatus, answerId, retry } = useAnswerFlow();
  const { phase, level, take, failed, toggle, reset } = recording;
  const isRecording = phase === 'recording';
  const saving = take && !take.tooShort;

  useEffect(() => {
    if (answerId) router.replace({ pathname: '/feedback/[answerId]', params: { answerId } });
  }, [answerId, router]);

  return (
    <Screen>
      {/* A stray back-swipe shouldn't cut an answer short. */}
      <Stack.Screen options={{ gestureEnabled: phase === 'idle' && !saving }} />
      {question.data ? <Text variant="question">{question.data.text}</Text> : null}
      <View style={styles.center}>
        {mic.status === 'denied' ? (
          <View style={styles.message}>
            <Text variant="body">{"Prompt can't hear you yet. Turn on the microphone in Settings, then come back."}</Text>
            <Button label="Open Settings" onPress={mic.openSettings} />
          </View>
        ) : question.isError ? (
          <View style={styles.message}>
            <Text variant="body">{"Today's question didn't load. Check your connection and try again."}</Text>
            <Button label="Try again" onPress={() => void question.refetch()} />
          </View>
        ) : saving && saveStatus === 'error' ? (
          <View style={styles.message}>
            <Text variant="body">{"That didn't upload. Your recording is saved. Tap to try again."}</Text>
            <Button label="Try again" onPress={retry} />
          </View>
        ) : saving ? (
          <Text variant="body" color="textSecondary">
            Saving your answer.
          </Text>
        ) : mic.status === 'granted' && take?.tooShort ? (
          <View style={styles.message}>
            <Text variant="body">{`${tooShortLength(take.durationMs)} Say a bit more: aim for at least 10.`}</Text>
            <Button label="Try again" onPress={reset} />
          </View>
        ) : mic.status === 'granted' && question.data ? (
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
