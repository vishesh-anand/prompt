import { Pressable, StyleSheet, View } from 'react-native';

import { Text, space, useTheme, answerLine, tapTarget } from '@/design';
import type { AnswerMap } from '@/lib/schemas/map';

import { segments, spokenShape, stepWords } from './answerShape';

type Props = { steps: AnswerMap['steps']; speakingSeconds: number; timeRanOut: boolean; onOpen: () => void };

// The answer line (DESIGN.md, Feedback reveal): one bar, a segment per step, widths by time. Off track solid
// textSecondary, the point solid textPrimary, the rest outlined. The segments carry no text; the steps are written
// underneath, so they survive large text and short steps. The whole block is one button that opens Step by step.
export function AnswerLine({ steps, speakingSeconds, timeRanOut, onOpen }: Props) {
  const { colors } = useTheme();
  const words = stepWords(steps, timeRanOut);
  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${spokenShape(steps, timeRanOut)} Opens step by step.`}
      onPress={onOpen}
      style={({ pressed }) => [styles.block, { opacity: pressed ? 0.6 : 1 }]}>
      <View style={styles.bar}>
        {segments(steps, speakingSeconds).map((segment, i) => (
          <View
            key={i}
            style={[
              styles.segment,
              { flexGrow: segment.share },
              segment.style === 'offTrack' && { backgroundColor: colors.textSecondary },
              segment.style === 'point' && { backgroundColor: colors.textPrimary },
              segment.style === 'outline' && { borderWidth: answerLine.outline, borderColor: colors.textSecondary },
            ]}
          />
        ))}
      </View>
      <Text variant="label" color="textPrimary">
        {words.map((word, i) => (
          <Text key={i} variant="label" color="textPrimary" strong={word.isPoint} tabular={word.isPoint}>
            {i > 0 ? ' → ' : ''}
            {word.text}
          </Text>
        ))}
      </Text>
      <View style={styles.open}>
        <Text variant="body" color="accentText" strong>
          {'Step by step ›'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.sm },
  bar: { flexDirection: 'row', gap: answerLine.gap, height: answerLine.height },
  // flexBasis 0, so each segment's width is its share of the time; a very short step still shows as a sliver.
  segment: { flexBasis: 0, minWidth: answerLine.height / 2, borderRadius: answerLine.height / 2 },
  open: { minHeight: tapTarget, justifyContent: 'center' },
});
