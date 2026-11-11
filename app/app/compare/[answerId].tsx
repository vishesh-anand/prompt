import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, Text, space } from '@/design';
import { CompareView } from '@/features/compare/CompareView';
import { useCompare } from '@/features/compare/useCompare';

// Your first try and your latest try side by side.
export default function Compare() {
  const { answerId } = useLocalSearchParams<{ answerId: string }>();
  const router = useRouter();
  const { view, result, tryAgain } = useCompare(answerId);

  // Nothing to compare (not a retry, or not yours): go home.
  if (view === 'unavailable') return <Redirect href="/" />;

  return (
    <Screen scroll>
      <View style={styles.content}>
        <Text variant="title">Before and after</Text>
        {view === 'loading' ? (
          <Text variant="body" color="textSecondary">
            Getting your two tries.
          </Text>
        ) : null}
        {view === 'noScores' ? <Text variant="body">{"Your first try has no scores, so there's nothing to compare yet."}</Text> : null}
        {view === 'ready' && result ? <CompareView instruction={result.instruction} rows={result.rows} summary={result.summary} /> : null}
      </View>

      <View style={styles.actions}>
        {tryAgain ? <Button label="Try again" onPress={() => router.replace({ pathname: '/record', params: tryAgain })} /> : null}
        <Button variant="quiet" label="Done" onPress={() => router.dismissTo('/')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.xxl, paddingBottom: space.xxl },
  actions: { gap: space.md },
});
