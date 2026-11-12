import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Screen, Text, space } from '@/design';
import { CompareView } from '@/features/compare/CompareView';
import { compareSamples } from '@/features/compare/samples';

// Development only: the before-and-after on made-up tries (features/compare/samples.ts, the six states in
// design-system/compare-e/), opened from the design preview. Nothing is recorded or played; the sheet works. To check
// dark mode, flip Appearance in Control Center.
export default function ComparePreview() {
  const { sample } = useLocalSearchParams<{ sample?: string }>();
  const router = useRouter();
  const chosen = compareSamples[Number(sample ?? 0)];
  const [heard, setHeard] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  if ((!__DEV__ && process.env.EXPO_PUBLIC_E2E !== '1') || !chosen) return <Redirect href="/" />;

  return (
    <Screen>
      <ScrollView style={styles.fill} contentContainerStyle={styles.content}>
        <CompareView
          data={chosen.data}
          actions={{
            onClose: () => router.back(),
            audio: {
              ready: true,
              playing,
              toggle: () => {
                setPlaying(!playing);
                setHeard(playing ? 'Would pause.' : 'Would play the second try.');
              },
            },
          }}
        />
        {heard ? (
          <Text variant="label" color="textSecondary">
            {heard}
          </Text>
        ) : null}
      </ScrollView>
      <View style={styles.pinned}>
        <Button label="Try again" onPress={() => setHeard('Would open the record screen.')} />
        <Button variant="link" label="Done" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingBottom: space.xl, gap: space.xl },
  pinned: { gap: space.sm, paddingTop: space.md },
});
