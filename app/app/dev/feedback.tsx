import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Screen, space } from '@/design';
import { FeedbackReveal } from '@/features/feedback/FeedbackReveal';
import { feedbackSamples } from '@/features/feedback/samples';
import { clock } from '@/lib/clock';

// Development only: the feedback screen on made-up answers (features/feedback/samples.ts), opened from the design
// preview. Nothing is recorded or saved; the taps, the sheets and the time buttons all work. To check dark mode, flip
// Appearance in Control Center.
export default function FeedbackPreview() {
  const { sample } = useLocalSearchParams<{ sample?: string }>();
  const router = useRouter();
  const chosen = feedbackSamples[Number(sample ?? 0)];
  const [confirmed, setConfirmed] = useState<boolean | null | undefined>(undefined);
  const [heard, setHeard] = useState<string | null>(null);
  const [flagged, setFlagged] = useState(false);

  if (!__DEV__ || !chosen) return <Redirect href="/" />;

  const data = { ...chosen.data, listenerConfirmed: confirmed === undefined ? chosen.data.listenerConfirmed : confirmed };

  return (
    <Screen>
      <ScrollView style={styles.fill} contentContainerStyle={styles.content}>
        <FeedbackReveal
          data={data}
          actions={{
            onDone: () => router.back(),
            onConfirm: (meant) => setConfirmed(data.listenerConfirmed === meant ? null : meant),
            audio: {
              ready: true,
              playing: false,
              toggle: () => setHeard('Would play the whole answer.'),
              // Old answers have no times, so no time buttons.
              playMoment: chosen.hasMoments ? (atSeconds) => setHeard(`Would play from ${clock(atSeconds)}.`) : null,
            },
            flag: chosen.data.coaching ? { flagged, onFlag: () => setFlagged(true) } : null,
            note: heard,
          }}
        />
      </ScrollView>
      <View style={styles.pinned}>
        <Button label="Try again with this tip" onPress={() => setHeard('Would open the record screen.')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingBottom: space.xl },
  pinned: { paddingTop: space.md },
});
