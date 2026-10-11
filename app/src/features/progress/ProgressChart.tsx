import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { space, Text, useTheme } from '@/design';

import { chartRows, chartSummary, dayLetters } from './chartRows';
import { layoutRow } from './chartGeometry';
import type { Averages, DayPoint } from './daySeries';

const rowHeight = 48;
const padding = 8;
const dotRadius = 3;

type Props = { series: DayPoint[]; start: Averages | null };

// The one chart: three small rows, one per measure, each on its own scale. One point per practice day, Monday to Sunday.
// No gridlines, no legend. The latest value sits at the end of each line, and the starting point is a faint dotted line.
// It never animates, so there is nothing for Reduce Motion to change.
export function ProgressChart({ series, start }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);

  return (
    <View style={styles.chart} accessible accessibilityRole="image" accessibilityLabel={chartSummary(series, start)}>
      {chartRows.map((row) => {
        const values = series.map(row.pick);
        const latest = [...values].reverse().find((v): v is number => v !== null) ?? null;
        const layout = layoutRow(values, start ? row.pickAverage(start) : null, { width, height: rowHeight, padding });
        return (
          <View key={row.id} style={styles.row}>
            <Text variant="label">{row.title}</Text>
            <View style={styles.line}>
              <View style={styles.svg} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
                {width > 0 ? (
                  <Svg width={width} height={rowHeight}>
                    {layout.baselineY !== null ? (
                      <Line x1={0} x2={width} y1={layout.baselineY} y2={layout.baselineY} stroke={colors.textSecondary} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="2 4" />
                    ) : null}
                    {layout.segments.map((segment, i) =>
                      segment.length > 1 ? <Polyline key={i} points={segment.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null,
                    )}
                    {layout.dots.map((p, i) => (
                      <Circle key={i} cx={p.x} cy={p.y} r={dotRadius} fill={colors.textPrimary} />
                    ))}
                  </Svg>
                ) : null}
              </View>
              <View style={styles.end}>
                <Text variant="label" color="textPrimary">
                  {latest === null ? '—' : row.format(latest)}
                </Text>
              </View>
            </View>
          </View>
        );
      })}
      <View style={styles.line}>
        <View style={[styles.svg, styles.days]}>
          {dayLetters.map((letter, i) => (
            <Text key={i} variant="label">
              {letter}
            </Text>
          ))}
        </View>
        <View style={styles.end} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { gap: space.lg },
  row: { gap: space.xs },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  svg: { flex: 1, height: rowHeight, justifyContent: 'center' },
  days: { height: undefined, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: padding - 3 },
  end: { width: 112 },
});
