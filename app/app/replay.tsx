import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, Text, space } from '@/design';
import { useReplay } from '@/features/recording/useReplay';

// Temporary: replaced by the real feedback screen in build steps 3 to 5.
export default function Replay() {
  const router = useRouter();
  const { uri, durationMs } = useLocalSearchParams<{ uri: string; durationMs: string }>();
  const { playing, toggle } = useReplay(uri);
  const seconds = Math.round(Number(durationMs) / 1000);

  return (
    <Screen>
      <View style={styles.center}>
        <Text variant="title">Your answer</Text>
        <Text variant="label">{`${seconds} seconds`}</Text>
      </View>
      <View style={styles.actions}>
        <Button label={playing ? 'Pause' : 'Play recording'} onPress={toggle} />
        <Button variant="secondary" label="Record again" onPress={() => router.replace('/record')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  actions: { gap: space.md },
});
