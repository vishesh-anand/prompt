import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Text, radius, space, useTheme } from '@/design';
import { clock } from '@/lib/clock';
import type { Coaching } from '@/lib/schemas/coaching';
import { curly } from '@/lib/typography';

import { tipMomentLine } from './feedbackText';
import { capsuleRadius, tapTarget } from './sizes';
import { TimeButton } from './TimeButton';

// The cards and rows of the feedback screen (DESIGN.md, Feedback reveal, parts 5 to 7).

// ---- 5. The tip: the largest text on the screen.

export function TipCard({ coaching }: { coaching: Coaching | null }) {
  const { colors } = useTheme();
  return (
    <Card>
      <Text variant="label" color="accentText" accessibilityRole="header">
        Your one thing for next time
      </Text>
      {coaching ? (
        <>
          {/* Coach prompt v7 splits the tip from its reason. An older tip is a long sentence or two, so it reads as body. */}
          <Text variant={coaching.reason ? 'title' : 'body'}>{curly(coaching.tip)}</Text>
          {coaching.reason ? <Text variant="body">{curly(coaching.reason)}</Text> : null}
          {coaching.moment ? <Text variant="label">{curly(tipMomentLine(coaching.moment))}</Text> : null}
        </>
      ) : (
        // While the tip is being written: a faint outline of what will appear, and one calm line.
        <View style={styles.waiting} accessibilityLiveRegion="polite">
          <View style={[styles.bar, styles.long, { backgroundColor: colors.fill }]} />
          <View style={[styles.bar, styles.short, { backgroundColor: colors.fill }]} />
          <Text variant="label">Writing your tip. This usually takes a few seconds.</Text>
        </View>
      )}
    </Card>
  );
}

// ---- 6. What an AI listener understood, with the two quiet buttons and the moment it lost the thread.

type ListenerProps = {
  restatement: string;
  confirmed: boolean | null;
  onConfirm: (meant: boolean) => void;
  // The first moment the listener lost the thread, when it is known and written in the screen's voice (map v9).
  lost: { atSeconds: number | null; why: string } | null;
  onPlay: ((atSeconds: number) => void) | null;
};

export function ListenerCard({ restatement, confirmed, onConfirm, lost, onPlay }: ListenerProps) {
  const choices = [
    { meant: true, label: 'That’s what I meant' },
    { meant: false, label: 'Not quite' },
  ];
  // Once one is tapped, only that one stays, with a check; tapping it again undoes it.
  const shown = confirmed === null ? choices : choices.filter((c) => c.meant === confirmed);
  return (
    <Card>
      <Text variant="label" accessibilityRole="header">
        What an AI listener understood
      </Text>
      <Text variant="body">{curly(restatement)}</Text>
      <View style={styles.choices}>
        {shown.map((choice) => (
          <QuietButton
            key={choice.label}
            label={choice.label}
            chosen={confirmed === choice.meant}
            onPress={() => onConfirm(choice.meant)}
          />
        ))}
      </View>
      {lost ? (
        <View style={styles.lost}>
          {onPlay && lost.atSeconds !== null ? <TimeButton atSeconds={lost.atSeconds} onPlay={onPlay} /> : null}
          <View style={styles.lostText}>
            <Text variant="body">{curly(`It lost the thread here, ${lost.why.trim().replace(/[.]$/, '')}.`)}</Text>
          </View>
        </View>
      ) : null}
    </Card>
  );
}

function QuietButton({ label, chosen, onPress }: { label: string; chosen: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: chosen }}
      accessibilityHint={chosen ? 'Tap again to undo.' : undefined}
      onPress={onPress}
      style={({ pressed }) => [styles.quiet, { backgroundColor: colors.fill, opacity: pressed ? 0.6 : 1 }]}>
      {chosen ? (
        <Text variant="body" color="accentText" strong>
          {'✓︎ '}
        </Text>
      ) : null}
      <Text variant="body" strong={chosen}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---- 7. The grouped list: Shorter and clearer, How it sounded, Play your answer.

export type Row = { title: string; subtitle?: string; onPress: () => void; kind: 'opens' | 'plays'; detail?: string; playing?: boolean };

export function FeedbackRows({ rows }: { rows: Row[] }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.group, { backgroundColor: colors.surface }]}>
      {rows.map((row, i) => (
        <View key={row.title}>
          {i > 0 ? <View style={[styles.divider, { backgroundColor: colors.divider }]} /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={[row.playing ? 'Pause your answer' : row.title, row.subtitle, row.detail].filter(Boolean).join(', ')}
            onPress={row.onPress}
            style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
            <View style={styles.flex}>
              <Text variant="body">{row.kind === 'plays' && row.playing ? 'Pause your answer' : row.title}</Text>
              {row.subtitle ? <Text variant="label">{row.subtitle}</Text> : null}
            </View>
            {row.detail ? (
              <Text variant="label" tabular>
                {row.detail}
              </Text>
            ) : null}
            <Text variant="body" color={row.kind === 'plays' ? 'accentText' : 'textSecondary'}>
              {row.kind === 'plays' ? (row.playing ? '❚❚︎' : '▶︎') : '›'}
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

// The length shown on the Play row.
export const lengthOf = (durationMs: number) => clock(durationMs / 1000);

const styles = StyleSheet.create({
  waiting: { gap: space.md },
  bar: { height: space.lg, borderRadius: space.sm },
  long: { width: '85%' },
  short: { width: '60%', height: space.md },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  quiet: { minHeight: tapTarget, borderRadius: capsuleRadius, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center' },
  lost: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, alignItems: 'center' },
  // Beside the time button while it fits; at large text sizes it wraps under it.
  lostText: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: '60%' },
  flex: { flex: 1 },
  group: { borderRadius: radius.card, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: space.lg },
  row: { minHeight: tapTarget, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg },
});
