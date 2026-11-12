import { StyleSheet, View, type DimensionValue } from 'react-native';

import { answerLine, useTheme } from '@/design';

import type { Segment, SegmentStyle } from './answerShape';

// The drawing both answer lines share (DESIGN.md, Feedback reveal and Before and after): one bar, a rounded segment
// per step, widths by share of the time. Off track solid textSecondary, the point solid textPrimary, the rest outlined.
// The colours mean the same in light and dark. `height` is 10 on the feedback screen and 12 on the before-and-after;
// `width` lets the before-and-after draw a shorter answer as a shorter bar.
export function SegmentBar({ segments, height, width = '100%' }: { segments: Segment[]; height: number; width?: DimensionValue }) {
  return (
    <View style={[styles.bar, { height, width }]}>
      {segments.map((segment, i) => (
        // flexBasis 0, so each segment's width is its share of the time; a very short step still shows as a sliver.
        <SegmentShape key={i} kind={segment.style} height={height} style={{ flexBasis: 0, flexGrow: segment.share, minWidth: height / 2 }} />
      ))}
    </View>
  );
}

// One segment drawn on its own, twice as wide as tall: the before-and-after's key.
export function Swatch({ kind, height }: { kind: SegmentStyle; height: number }) {
  return <SegmentShape kind={kind} height={height} style={{ width: height * 2 }} />;
}

function SegmentShape({ kind, height, style }: { kind: SegmentStyle; height: number; style: object }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        style,
        { height, borderRadius: height / 2 },
        kind === 'offTrack' && { backgroundColor: colors.textSecondary },
        kind === 'point' && { backgroundColor: colors.textPrimary },
        kind === 'outline' && { borderWidth: answerLine.outline, borderColor: colors.textSecondary },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', gap: answerLine.gap },
});
