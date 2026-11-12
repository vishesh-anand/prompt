import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Screen, Text, space } from '@/design';
import { useTries } from '@/features/compare/useTries';
import { FeedbackReveal } from '@/features/feedback/FeedbackReveal';
import { ListeningCircle } from '@/features/feedback/ListeningCircle';
import { nextConfirmation, useConfirmListener } from '@/features/feedback/useConfirmListener';
import { useFeedback } from '@/features/feedback/useFeedback';
import { useFeedbackAudio } from '@/features/feedback/useFeedbackAudio';
import { useFlagFeedback } from '@/features/feedback/useFlagFeedback';

// Results appear here as the server saves each stage: how the answer was built first, then the tip and the rest.
// The one filled button sits below the scroll, within thumb reach.
export default function Feedback() {
  const { answerId } = useLocalSearchParams<{ answerId: string }>();
  const router = useRouter();
  const { answer, question, view, metrics, map, coaching, timeRanOut, finished, next, stalled, retry } = useFeedback(answerId);
  const flag = useFlagFeedback(answerId);
  // Which try this is, for the top bar.
  const tries = useTries(answer.data);
  const confirm = useConfirmListener(answerId);
  const audio = useFeedbackAudio(answer.data?.audio_path, map?.firstWordAtSeconds);

  // The answer isn't yours or doesn't exist (for example, an old prompt:// link): go home.
  if (answer.isError) return <Redirect href="/" />;

  const done = () => {
    audio.pause();
    router.dismissTo('/');
  };
  const confirmed = answer.data?.listener_confirmed ?? null;

  return (
    <Screen>
      <ScrollView style={styles.fill} contentContainerStyle={styles.content}>
        {view === 'listening' ? (
          <View style={styles.listening}>
            <ListeningCircle />
            <Text variant="body" color="textSecondary">
              Listening to your answer.
            </Text>
          </View>
        ) : null}

        {view === 'problem' ? <Text variant="body">{'That didn’t process. Your recording is saved. Tap to try again.'}</Text> : null}

        {view === 'limit' ? <Text variant="body">{'That’s 10 answers today, the most for one day. Your recording is saved. Come back tomorrow.'}</Text> : null}

        {view === 'noWords' ? <Text variant="body">{'We didn’t catch any words. Check nothing is covering the mic, then record again.'}</Text> : null}

        {view === 'ready' && answer.data ? (
          <FeedbackReveal
            data={{
              category: question?.category ?? null,
              tryNumber: tries.tryNumber,
              question: question?.text ?? null,
              map,
              metrics,
              coaching,
              durationMs: answer.data.duration_ms,
              timeRanOut,
              listenerConfirmed: confirmed,
            }}
            actions={{
              onDone: done,
              onConfirm: (meant) => confirm.mutate(nextConfirmation(confirmed, meant)),
              audio,
              flag: finished && coaching ? { flagged: answer.data.feedback_flagged || flag.isSuccess, onFlag: () => flag.mutate() } : null,
              note: stalled ? 'The rest didn’t finish. Your recording is saved. Tap to try again.' : null,
            }}
          />
        ) : null}
      </ScrollView>

      <View style={styles.pinned}>
        {view === 'problem' || stalled ? <Button label="Try again" onPress={retry} /> : null}
        {view === 'noWords' && answer.data ? (
          <Button
            label="Record again"
            onPress={() =>
              router.replace({
                pathname: '/record',
                params: { questionId: answer.data.question_id, ...(answer.data.retry_of ? { retryOf: answer.data.retry_of } : {}) },
              })
            }
          />
        ) : null}
        {next?.kind === 'tryAgain' ? (
          <Button
            label="Try again with this tip"
            onPress={() => {
              audio.pause();
              router.replace({ pathname: '/record', params: next.params });
            }}
          />
        ) : null}
        {next?.kind === 'compare' ? (
          <Button label="See before and after" onPress={() => router.push({ pathname: '/compare/[answerId]', params: { answerId: next.answerId } })} />
        ) : null}
        {view !== 'ready' ? <Button variant={view === 'limit' ? 'primary' : 'quiet'} label="Done" onPress={done} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingBottom: space.xl },
  listening: { alignItems: 'center', gap: space.xl, paddingTop: space.xxxl },
  pinned: { gap: space.md, paddingTop: space.md },
});
