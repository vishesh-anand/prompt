import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, Text, space } from '@/design';
import { useAnswer } from '@/features/answers/useAnswer';
import { useRecordingUrl } from '@/features/answers/useRecordingUrl';
import { useReplay } from '@/features/recording/useReplay';

// Feedback itself arrives in build steps 4 and 5. For now this confirms the answer is saved.
export default function Feedback() {
  const { answerId } = useLocalSearchParams<{ answerId: string }>();
  const router = useRouter();
  const answer = useAnswer(answerId);
  const url = useRecordingUrl(answer.data?.audio_path);
  const { playing, toggle } = useReplay(url.data ?? null);

  // The answer isn't yours or doesn't exist (for example, an old prompt:// link): go home.
  if (answer.isError) return <Redirect href="/" />;

  const seconds = answer.data ? Math.round(answer.data.duration_ms / 1000) : null;

  return (
    <Screen>
      <View style={styles.center}>
        <Text variant="title">Your answer is saved.</Text>
        {seconds !== null ? <Text variant="label">{`${seconds} seconds`}</Text> : null}
      </View>
      <View style={styles.actions}>
        {url.data ? <Button variant="secondary" label={playing ? 'Pause' : 'Play recording'} onPress={toggle} /> : null}
        <Button label="Done" onPress={() => router.replace('/')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  actions: { gap: space.md },
});
