import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, Stat, Text, space } from '@/design';
import { useRecordingUrl } from '@/features/answers/useRecordingUrl';
import { describeMetrics } from '@/features/feedback/describeMetrics';
import { useFeedback } from '@/features/feedback/useFeedback';
import { useReplay } from '@/features/recording/useReplay';

// Results appear here as the server saves each stage. Filler words and speed today; the rest arrives in step 5.
export default function Feedback() {
  const { answerId } = useLocalSearchParams<{ answerId: string }>();
  const router = useRouter();
  const { answer, view, metrics, retry } = useFeedback(answerId);
  const url = useRecordingUrl(answer.data?.audio_path);
  const { playing, toggle } = useReplay(url.data ?? null);

  // The answer isn't yours or doesn't exist (for example, an old prompt:// link): go home.
  if (answer.isError) return <Redirect href="/" />;

  const shown = metrics && (view === 'ready' || view === 'noWords') ? describeMetrics(metrics) : null;

  return (
    <Screen scroll>
      <View style={styles.content}>
        {view === 'listening' ? (
          <Text variant="body" color="textSecondary">
            Listening to your answer.
          </Text>
        ) : null}

        {view === 'problem' ? (
          <>
            <Text variant="body">{"That didn't process. Your recording is saved. Tap to try again."}</Text>
            <Button label="Try again" onPress={retry} />
          </>
        ) : null}

        {view === 'limit' ? (
          <Text variant="body">{"That's 10 answers today, the most for one day. Your recording is saved. Come back tomorrow."}</Text>
        ) : null}

        {view === 'noWords' ? (
          <>
            <Text variant="body">{"We didn't catch any words. Check nothing is covering the mic, then record again."}</Text>
            <Button label="Record again" onPress={() => router.replace('/record')} />
          </>
        ) : null}

        {view === 'ready' && shown ? (
          <>
            <View style={styles.result}>
              <Stat label="Filler words" value={shown.fillerCount} />
              {shown.fillerList ? <Text variant="label">{shown.fillerList}</Text> : null}
            </View>
            <View style={styles.result}>
              <Stat label="Speed" value={shown.speed} />
              <Text variant="label">{shown.speedDetail}</Text>
            </View>
          </>
        ) : null}
      </View>

      <View style={styles.actions}>
        {url.data ? <Button variant="secondary" label={playing ? 'Pause' : 'Play recording'} onPress={toggle} /> : null}
        <Button variant={view === 'ready' || view === 'limit' ? 'primary' : 'secondary'} label="Done" onPress={() => router.replace('/')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.xxl, paddingBottom: space.xxl },
  result: { gap: space.sm },
  actions: { gap: space.md },
});
