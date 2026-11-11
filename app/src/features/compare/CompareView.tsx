import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { Card, revealMotion, space, Text, useTheme } from '@/design';
import { useReduceMotion } from '@/hooks/useReduceMotion';

import { CountNumber } from './CountNumber';
import type { CompareRow, InstructionCheck, Summary } from './compareAttempts';

type Props = { instruction: InstructionCheck; rows: CompareRow[]; summary: Summary };

// The before-and-after: the instruction checked first, then the first try and the latest try side by side. Rows appear
// one at a time, top to bottom, like the feedback reveal; improvements get a green arrow and a short line, and the
// numbers count into place. A first version, until the screen gets its own design pass (step E3).
export function CompareView({ instruction, rows, summary }: Props) {
  const reduceMotion = useReduceMotion();
  const enter = (step: number) => {
    const delay = step * revealMotion.staggerMs;
    return reduceMotion
      ? FadeIn.delay(delay).duration(revealMotion.itemMs).reduceMotion(ReduceMotion.Never)
      : FadeInDown.delay(delay).duration(revealMotion.itemMs).easing(Easing.out(Easing.quad)).reduceMotion(ReduceMotion.Never);
  };

  return (
    <View style={styles.list}>
      {instruction.line ? (
        <Animated.View entering={enter(0)}>
          <Text variant="headline">{instruction.line}</Text>
        </Animated.View>
      ) : null}

      <View style={styles.columns}>
        <Text variant="label">First try</Text>
        <Text variant="label">Now</Text>
      </View>

      {rows.map((row, i) => (
        <Animated.View key={row.id} entering={enter(i + 1)}>
          <Row row={row} />
        </Animated.View>
      ))}

      <Animated.View entering={enter(rows.length + 1)} style={styles.group}>
        {summary.improved ? null : (
          <>
            <Text variant="body">{summary.message}</Text>
            {summary.nextStep ? (
              <Card>
                <Text variant="label">One thing to try</Text>
                <Text variant="title">{summary.nextStep}</Text>
              </Card>
            ) : null}
          </>
        )}
      </Animated.View>
    </View>
  );
}

function Row({ row }: { row: CompareRow }) {
  const { colors } = useTheme();
  const variant = row.count ? 'bigNumber' : 'title';

  return (
    <View style={styles.row} accessible accessibilityLabel={`${row.label}. First try: ${row.before}. Now: ${row.after}. ${row.line}`}>
      <Text variant="label">{row.label}</Text>
      <View style={styles.columns}>
        <Text variant={variant} tabular>
          {row.before}
        </Text>
        {row.count ? <CountNumber from={row.count.before} to={row.count.after} unit={row.count.unit} /> : <Text variant={variant} tabular>{row.after}</Text>}
      </View>
      {row.improved ? (
        <View style={styles.change}>
          <SymbolView name={row.arrow === 'up' ? 'arrow.up' : 'arrow.down'} size={14} tintColor={colors.positive} />
          <Text variant="label" color="positive">
            {row.line}
          </Text>
        </View>
      ) : (
        <Text variant="label">{row.line}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.xxl },
  group: { gap: space.lg },
  row: { gap: space.xs },
  columns: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  change: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
