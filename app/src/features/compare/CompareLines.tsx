import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text, answerLine, space, tapTarget, useTheme } from '@/design';
import { spokenShape } from '@/features/feedback/answerShape';
import type { Segment } from '@/features/feedback/answerShape';
import { clock } from '@/lib/clock';
import type { AnswerMap } from '@/lib/schemas/map';

import { timeline } from './timeline';

export type LineTry = { title: string; map: AnswerMap; speakingSeconds: number };

// The two answer lines (DESIGN.md, Before and after): first try above, this try below, on one scale from 0:00 to 2:00,
// drawn like the feedback screen's line but 12 tall, each with "Point at 1:10" under it where the point starts. Then the
// scale, a key, and "Both maps, step by step ›". The whole block is one button; VoiceOver reads it as one summary.
export function CompareLines({ first, latest, onOpen }: { first: LineTry; latest: LineTry; onOpen: () => void }) {
  const summary = [first, latest].map((t) => `${t.title}: ${spokenShape(t.map.steps, false)}`).join(' ');
  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${summary} Opens both maps, step by step.`}
      onPress={onOpen}
      style={({ pressed }) => [styles.block, { opacity: pressed ? 0.6 : 1 }]}>
      <Line t={first} />
      <Line t={latest} />
      <View style={styles.scale}>
        {['0:00', '1:00', '2:00'].map((time) => (
          <Text key={time} variant="caption" tabular>
            {time}
          </Text>
        ))}
      </View>
      <Key />
      <View style={styles.open}>
        <Text variant="body" color="accentText" strong>
          {'Both maps, step by step ›'}
        </Text>
      </View>
    </Pressable>
  );
}

function Line({ t }: { t: LineTry }) {
  const { width, segments, pointAt } = timeline(t.map, t.speakingSeconds);
  // The point's label starts where the point does, and is pulled left if it would run off the end.
  const [box, setBox] = useState(0);
  // null until measured: the label stays hidden for that first frame, so it never shows past the edge and jumps back.
  const [label, setLabel] = useState<number | null>(null);
  const left = pointAt === null || label === null ? 0 : Math.max(0, Math.min(pointAt.share * box, box - label));
  return (
    <View style={styles.line} onLayout={(e) => setBox(e.nativeEvent.layout.width)}>
      <Text variant="label">{t.title}</Text>
      <View style={[styles.bar, { width: `${width * 100}%` }]}>
        {segments.map((segment, i) => (
          <SegmentView key={i} segment={segment} grow />
        ))}
      </View>
      <View style={styles.pointRow}>
        <View style={{ marginLeft: left, opacity: label === null && pointAt !== null ? 0 : 1 }} onLayout={(e) => setLabel(e.nativeEvent.layout.width)}>
          <Text variant="label" color="textPrimary" strong tabular>
            {pointAt === null ? 'No clear point' : `Point at ${clock(pointAt.seconds)}`}
          </Text>
        </View>
      </View>
    </View>
  );
}

// One step's segment, or a key swatch: off track solid textSecondary, the point solid textPrimary, the rest outlined.
// The colours mean the same in light and dark.
function SegmentView({ segment, grow }: { segment: Pick<Segment, 'style'> & { share?: number }; grow?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        grow ? [styles.segment, { flexGrow: segment.share ?? 1 }] : styles.swatch,
        segment.style === 'offTrack' && { backgroundColor: colors.textSecondary },
        segment.style === 'point' && { backgroundColor: colors.textPrimary },
        segment.style === 'outline' && { borderWidth: answerLine.outline, borderColor: colors.textSecondary },
      ]}
    />
  );
}

function Key() {
  const items = [
    { style: 'point' as const, text: 'Point' },
    { style: 'offTrack' as const, text: 'Off track' },
    { style: 'outline' as const, text: 'Other steps' },
  ];
  return (
    <View style={styles.key}>
      {items.map((item) => (
        <View key={item.text} style={styles.keyItem}>
          <SegmentView segment={{ style: item.style }} />
          <Text variant="label" color="textPrimary">
            {item.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.lg },
  line: { gap: space.xs },
  bar: { flexDirection: 'row', gap: answerLine.gap, height: answerLine.compareHeight },
  // flexBasis 0, so each segment's width is its share of the time; a very short step still shows as a sliver.
  segment: { flexBasis: 0, minWidth: answerLine.compareHeight / 2, borderRadius: answerLine.compareHeight / 2 },
  pointRow: { flexDirection: 'row' },
  scale: { flexDirection: 'row', justifyContent: 'space-between' },
  key: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.sm },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  swatch: { width: answerLine.compareHeight * 2, height: answerLine.compareHeight, borderRadius: answerLine.compareHeight / 2 },
  open: { minHeight: tapTarget, justifyContent: 'center' },
});
