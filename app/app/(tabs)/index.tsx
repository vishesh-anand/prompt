import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, SegmentedControl, Text, space } from '@/design';
import { usePendingAnswers, useUploadPending } from '@/features/answers/usePendingAnswers';
import { categoryOptions, showTestTools, useHome } from '@/features/home/useHome';
import { RecordingCircle } from '@/features/recording/RecordingCircle';
import { firstTryMs } from '@/features/recording/limits';
import { supabase } from '@/lib/supabase';

// Pick the kind of question, see today's question and your streak, tap the circle to answer.
export default function Home() {
  const router = useRouter();
  const home = useHome();
  const pending = usePendingAnswers().data?.[0];
  const upload = useUploadPending();
  const { question, streak } = home;

  // First-time setup comes first: pick a reminder time, then answer your first question.
  if (home.needsSetup) return <Redirect href="/reminder" />;

  function retryUpload() {
    if (!pending) return;
    upload.mutate(pending, {
      onSuccess: (answerId) => router.push({ pathname: '/feedback/[answerId]', params: { answerId } }),
    });
  }

  return (
    <Screen scroll>
      <View style={styles.top}>
        {home.loaded ? (
          <SegmentedControl options={categoryOptions} value={home.category} onChange={home.chooseCategory} accessibilityLabel="Kind of question" />
        ) : null}
        {home.loadFailed ? (
          <View style={styles.message}>
            <Text variant="body">{"Today's question didn't load. Check your connection and try again."}</Text>
            <Button label="Try again" onPress={home.reload} />
          </View>
        ) : question ? (
          <Text variant="question" testID="home-question">
            {question.text}
          </Text>
        ) : home.loaded ? (
          <Text variant="body" color="textSecondary">
            {"There are no questions of this kind yet. Try the other kind."}
          </Text>
        ) : null}
        {home.loaded ? (
          <View
            style={styles.streak}
            accessible
            accessibilityLabel={streak.days === 0 ? 'No streak yet' : `Streak: ${streak.days} ${streak.days === 1 ? 'day' : 'days'} in a row`}>
            {streak.days === 0 ? (
              <Text variant="label">{"Your streak starts with today's answer."}</Text>
            ) : (
              <>
                <Text variant="bigNumber" color="accentText">
                  {streak.days}
                </Text>
                <Text variant="label">{streak.days === 1 ? 'day in a row' : 'days in a row'}</Text>
                {!streak.practicedToday ? <Text variant="label">Answer today to keep it going.</Text> : null}
              </>
            )}
          </View>
        ) : null}
      </View>

      <View style={styles.center}>
        {pending ? (
          <View style={styles.message}>
            <Text variant="body" color="textSecondary">
              {"That didn't upload. Your recording is saved. Tap to try again."}
            </Text>
            <Button label="Try again" onPress={retryUpload} />
          </View>
        ) : question ? (
          <RecordingCircle
            recording={false}
            level={0}
            limitMs={firstTryMs}
            accessibilityLabel="Answer today's question"
            onPress={() => router.push({ pathname: '/record', params: { questionId: String(question.id) } })}
          />
        ) : null}
      </View>

      {showTestTools ? (
        <View style={styles.dev}>
          <Button variant="secondary" label="Reminders" onPress={() => router.push('/dev/reminders')} />
          {__DEV__ ? (
            <>
              <Button variant="secondary" label="Design preview" onPress={() => router.push('/dev/design')} />
              <Button variant="secondary" label="Sign out" onPress={() => void supabase.auth.signOut()} />
            </>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: space.xl },
  streak: { gap: space.xs },
  center: { alignItems: 'center', paddingVertical: space.xxl },
  message: { alignSelf: 'stretch', gap: space.xl },
  dev: { gap: space.md },
});
