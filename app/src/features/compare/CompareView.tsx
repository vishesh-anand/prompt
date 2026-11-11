import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { Card, revealMotion, space, Text, useTheme } from '@/design';
import { useReduceMotion } from '@/hooks/useReduceMotion';

import type { CompareResult } from './compareAttempts';

// A first version of the before-and-after, until step E3 builds the signed-off design (design-system/compare-e/):
// the tip, whether it worked, the check, the three rows as sentences, and the next tip.
export function CompareView({ result }: { result: CompareResult }) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const enter = (step: number) => {
    const delay = step * revealMotion.staggerMs;
    return reduceMotion
      ? FadeIn.delay(delay).duration(revealMotion.itemMs).reduceMotion(ReduceMotion.Never)
      : FadeInDown.delay(delay).duration(revealMotion.itemMs).easing(Easing.out(Easing.quad)).reduceMotion(ReduceMotion.Never);
  };
  const status = { worked: 'The tip worked', closer: 'Closer, not there yet', notYet: 'Not yet', notMeasured: 'Not measured here' }[result.status];

  return (
    <View style={styles.list}>
      <Animated.View entering={enter(0)} style={styles.group}>
        {result.tip ? <Text variant="subheadline">{`Your tip: ${result.tip}`}</Text> : null}
        <Text variant="headline" color={result.status === 'worked' ? 'positive' : 'textPrimary'}>
          {status}
        </Text>
        <Text variant="title">{result.check}</Text>
      </Animated.View>

      {result.rows.map((row, i) => (
        <Animated.View key={row.id} entering={enter(i + 1)} style={styles.row} accessible accessibilityLabel={`${row.word}. ${row.fact}`}>
          <View style={styles.word}>
            {row.trend === 'better' ? <SymbolView name="arrow.up" size={13} tintColor={row.credited ? colors.positive : colors.textPrimary} /> : null}
            <Text variant="label" strong color={row.credited ? 'positive' : row.trend === 'same' ? 'textSecondary' : 'textPrimary'}>
              {row.word}
            </Text>
          </View>
          <Text variant="body">{row.fact}</Text>
        </Animated.View>
      ))}

      {result.nextTip ? (
        <Animated.View entering={enter(result.rows.length + 1)}>
          <Card>
            <Text variant="label" color="accentText">
              {result.nextTip.heading}
            </Text>
            <Text variant="title">{result.nextTip.tip}</Text>
          </Card>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.xxl },
  group: { gap: space.sm },
  row: { gap: space.xs },
  word: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
