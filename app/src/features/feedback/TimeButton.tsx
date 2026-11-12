import { Pressable, StyleSheet, View } from 'react-native';

import { Text, space, useTheme, capsuleRadius, tapTarget } from '@/design';
import { clock } from '@/lib/clock';

// "▶ 0:40": plays the recording from that moment (DESIGN.md, Feedback reveal). A quiet capsule, at least 44 tall.
// `atSeconds` is shown as on the map (from the first spoken word); `onPlay` gets the same number.
export function TimeButton({ atSeconds, onPlay }: { atSeconds: number; onPlay: (atSeconds: number) => void }) {
  const { colors } = useTheme();
  const time = clock(atSeconds);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Play from ${time}`}
      onPress={() => onPlay(atSeconds)}
      style={({ pressed }) => [styles.button, { backgroundColor: colors.fill, opacity: pressed ? 0.6 : 1 }]}>
      <View style={styles.row}>
        {/* U+FE0E keeps the triangle a text glyph, never an emoji. */}
        <Text variant="label" color="accentText">
          {'▶︎'}
        </Text>
        <Text variant="body" strong tabular>
          {time}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: tapTarget, borderRadius: capsuleRadius, paddingHorizontal: space.md, justifyContent: 'center', alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
