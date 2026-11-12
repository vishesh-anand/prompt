import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text, answerLine, space, tapTarget } from '@/design';
import { spokenShape } from '@/features/feedback/answerShape';
import { SegmentBar, Swatch } from '@/features/feedback/SegmentBar';
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
      <SegmentBar segments={segments} height={answerLine.compareHeight} width={`${width * 100}%`} />
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
          <Swatch kind={item.style} height={answerLine.compareHeight} />
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
  pointRow: { flexDirection: 'row' },
  scale: { flexDirection: 'row', justifyContent: 'space-between' },
  key: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.sm },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  open: { minHeight: tapTarget, justifyContent: 'center' },
});
