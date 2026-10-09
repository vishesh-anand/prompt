import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { Card, revealMotion, space, Text, useTheme } from '@/design';
import { useReduceMotion } from '@/hooks/useReduceMotion';

import { CountNumber } from './CountNumber';
import type { CompareRow, Summary } from './compareAttempts';

type Props = { rows: CompareRow[]; summary: Summary };

// The before-and-after: first try and latest try side by side. Rows appear one at a time, top to bottom, like the
// feedback reveal; improvements get a green arrow and a short line, and the filler count counts into place.
export function CompareView({ rows, summary }: Props) {
  const reduceMotion = useReduceMotion();
  const enter = (step: number) => {
    const delay = step * revealMotion.staggerMs;
    return reduceMotion
      ? FadeIn.delay(delay).duration(revealMotion.itemMs).reduceMotion(ReduceMotion.Never)
      : FadeInDown.delay(delay).duration(revealMotion.itemMs).easing(Easing.out(Easing.quad)).reduceMotion(ReduceMotion.Never);
  };

  const filler = rows.find((r) => r.id === 'fillers');
  const speed = rows.find((r) => r.id === 'speed');
  const marks = rows.filter((r) => r.id !== 'fillers' && r.id !== 'speed');

  return (
    <View style={styles.list}>
      <View style={styles.columns}>
        <Text variant="label">First try</Text>
        <Text variant="label">Now</Text>
      </View>

      {filler ? <Animated.View entering={enter(0)}><Row row={filler} delayMs={0} /></Animated.View> : null}
      {speed ? <Animated.View entering={enter(1)}><Row row={speed} /></Animated.View> : null}

      <Animated.View entering={enter(2)} style={styles.group}>
        <Text variant="label">Clear point</Text>
        {marks.map((row) => (
          <Row key={row.id} row={row} />
        ))}
      </Animated.View>

      <Animated.View entering={enter(3)} style={styles.group}>
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

function Row({ row, delayMs }: { row: CompareRow; delayMs?: number }) {
  const { colors } = useTheme();
  const numeric = row.count !== undefined;
  const variant = numeric ? 'bigNumber' : row.id === 'speed' ? 'title' : 'body';
  // The columns already show a mark that stayed the same, so a line is only added when it says something more.
  const showLine = row.improved || row.id === 'fillers' || row.id === 'speed' || [row.before, row.after].includes('Time ran out');

  return (
    <View style={styles.row} accessible accessibilityLabel={`${row.label}. First try: ${row.before}. Now: ${row.after}. ${row.line}.`}>
      <Text variant={row.id === 'fillers' || row.id === 'speed' ? 'label' : 'body'} color={row.id === 'fillers' || row.id === 'speed' ? undefined : 'textSecondary'}>
        {row.label}
      </Text>
      <View style={styles.columns}>
        <Text variant={variant}>{row.before}</Text>
        {row.count ? <CountNumber from={row.count.before} to={row.count.after} delayMs={delayMs} /> : <Text variant={variant}>{row.after}</Text>}
      </View>
      {showLine ? (
        row.improved ? (
          <View style={styles.change}>
            <SymbolView name={row.arrow === 'up' ? 'arrow.up' : 'arrow.down'} size={14} tintColor={colors.positive} />
            <Text variant="label" color="positive">
              {row.line}
            </Text>
          </View>
        ) : (
          <Text variant="label">{row.line}</Text>
        )
      ) : null}
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
