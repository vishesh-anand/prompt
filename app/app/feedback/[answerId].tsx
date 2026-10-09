import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, Text, space } from '@/design';
import { useRecordingUrl } from '@/features/answers/useRecordingUrl';
import { FeedbackReveal } from '@/features/feedback/FeedbackReveal';
import { ListeningCircle } from '@/features/feedback/ListeningCircle';
import { useFeedback } from '@/features/feedback/useFeedback';
import { useFlagFeedback } from '@/features/feedback/useFlagFeedback';
import { useReplay } from '@/features/recording/useReplay';

// Results appear here as the server saves each stage: counted numbers first, then the marks, the tip and the better version.
export default function Feedback() {
  const { answerId } = useLocalSearchParams<{ answerId: string }>();
  const router = useRouter();
  const { answer, view, metrics, judgement, coaching, timeRanOut, finished, next, stalled, retry } = useFeedback(answerId);
  const flag = useFlagFeedback(answerId);
  const url = useRecordingUrl(answer.data?.audio_path);
  const { playing, toggle } = useReplay(url.data ?? null);

  // The answer isn't yours or doesn't exist (for example, an old prompt:// link): go home.
  if (answer.isError) return <Redirect href="/" />;

  const flagged = answer.data?.feedback_flagged === true || flag.isSuccess;

  return (
    <Screen scroll>
      <View style={styles.content}>
        {view === 'listening' ? (
          <View style={styles.listening}>
            <ListeningCircle />
            <Text variant="body" color="textSecondary">
              Listening to your answer.
            </Text>
          </View>
        ) : null}

        {view === 'problem' ? <Text variant="body">{"That didn't process. Your recording is saved. Tap to try again."}</Text> : null}

        {view === 'limit' ? (
          <Text variant="body">{"That's 10 answers today, the most for one day. Your recording is saved. Come back tomorrow."}</Text>
        ) : null}

        {view === 'noWords' ? <Text variant="body">{"We didn't catch any words. Check nothing is covering the mic, then record again."}</Text> : null}

        {view === 'ready' && metrics ? (
          <>
            <FeedbackReveal metrics={metrics} judgement={judgement} coaching={coaching} stoppedByTimeLimit={timeRanOut} />
            {stalled ? <Text variant="body">{"The rest didn't finish. Your recording is saved. Tap to try again."}</Text> : null}
            {!finished && !stalled ? <Text variant="label">{judgement ? 'Writing your tip.' : 'Reading how your answer is built.'}</Text> : null}
          </>
        ) : null}
      </View>

      <View style={styles.actions}>
        {view === 'problem' || stalled ? <Button label="Try again" onPress={retry} /> : null}
        {view === 'noWords' ? <Button label="Record again" onPress={() => router.replace('/record')} /> : null}
        {next?.kind === 'tryAgain' ? (
          <Button label="Try again" onPress={() => router.replace({ pathname: '/record', params: next.params })} />
        ) : null}
        {next?.kind === 'compare' ? (
          <Button label="See before and after" onPress={() => router.push({ pathname: '/compare/[answerId]', params: { answerId: next.answerId } })} />
        ) : null}
        {url.data ? <Button variant="secondary" label={playing ? 'Pause' : 'Play recording'} onPress={toggle} /> : null}
        {finished && coaching ? (
          <Button
            variant="quiet"
            label={flagged ? "Thanks. We'll look at this answer." : 'This feedback is wrong'}
            onPress={() => (flagged ? undefined : flag.mutate())}
          />
        ) : null}
        <Button variant={view === 'limit' ? 'primary' : 'quiet'} label="Done" onPress={() => router.replace('/')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.xxl, paddingBottom: space.xxl },
  listening: { alignItems: 'center', gap: space.xl, paddingTop: space.xxxl },
  actions: { gap: space.md },
});
