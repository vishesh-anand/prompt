import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Screen, Text, space } from '@/design';
import { CompareView } from '@/features/compare/CompareView';
import { useCompare } from '@/features/compare/useCompare';

// Your first try and your latest try. The two actions sit below the scroll, within thumb reach: "Try again" (the same
// question, with the newest tip) is the one filled button.
export default function Compare() {
  const { answerId } = useLocalSearchParams<{ answerId: string }>();
  const router = useRouter();
  const { view, data, audio, retryQuestion, tryAgain } = useCompare(answerId);

  // Nothing to compare (not a retry, or not yours): go home.
  if (view === 'unavailable') return <Redirect href="/" />;

  const done = () => {
    audio.pause();
    router.dismissTo('/');
  };

  return (
    <Screen>
      <ScrollView style={styles.fill} contentContainerStyle={styles.content}>
        {view === 'questionError' ? (
          <View style={styles.message}>
            <Text variant="body">{'Your two tries didn’t load. Check your connection and try again.'}</Text>
            <Button variant="secondary" label="Load again" onPress={retryQuestion} />
          </View>
        ) : view === 'loading' || !data ? (
          <Text variant="body" color="textSecondary">
            Getting your two tries.
          </Text>
        ) : (
          <CompareView data={data} actions={{ onClose: done, audio }} />
        )}
      </ScrollView>

      <View style={styles.pinned}>
        {tryAgain ? (
          <Button
            label="Try again"
            onPress={() => {
              // The recorder takes over the audio session.
              audio.pause();
              router.replace({ pathname: '/record', params: tryAgain });
            }}
          />
        ) : null}
        <Button variant="link" label="Done" onPress={done} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingBottom: space.xl },
  pinned: { gap: space.sm, paddingTop: space.md },
  message: { gap: space.xl },
});
