import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { Card, Text, capsuleRadius, radius, revealMotion, space, tapTarget, useTheme, type ColorToken } from '@/design';
import { FeedbackSheet } from '@/features/feedback/FeedbackSheet';
import { BothMaps } from '@/features/feedback/SheetContents';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import type { AnswerMap } from '@/lib/schemas/map';
import { curly } from '@/lib/typography';

import { CompareLines } from './CompareLines';
import type { CompareResult, CompareRow, Status } from './compareAttempts';
import { tryLabel } from './tries';

export type TryView = { map: AnswerMap; speakingSeconds: number; durationSeconds: number };

export type CompareData = {
  category: 'work' | 'everyday' | null;
  // 2 for a second try, 3 for a third.
  tryNumber: number;
  // The practice line shows on someone's first retry only.
  firstRetry: boolean;
  // null: the first try was scored before this view existed, so there is nothing to compare.
  tries: { first: TryView; latest: TryView; result: CompareResult } | null;
};

export type CompareActions = {
  onClose: () => void;
  // The latest try's recording, for "Play your second try" when the tip isn't measured here.
  audio: { ready: boolean; playing: boolean; toggle: () => void };
};

const status: Record<Status, { text: string; symbol: SFSymbol | null; color: ColorToken }> = {
  worked: { text: 'The tip worked', symbol: 'checkmark', color: 'positive' },
  closer: { text: 'Closer, not there yet', symbol: 'arrow.up', color: 'textPrimary' },
  notYet: { text: 'Not yet', symbol: 'minus', color: 'textPrimary' },
  notMeasured: { text: 'Not measured here', symbol: null, color: 'textPrimary' },
};

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// The before-and-after (DESIGN.md, Before and after; mockups in design-system/compare-e/): the tip that was checked,
// whether it worked, both answer lines on one scale, the three rows as sentences, and the next tip. Parts appear one at a
// time, top to bottom, like the feedback reveal; with Reduce Motion on they fade in without moving. "Try again" and
// "Done" are not here: the screen pins them below the scroll.
export function CompareView({ data, actions }: { data: CompareData; actions: CompareActions }) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const [stepsOpen, setStepsOpen] = useState(false);
  const enter = (step: number) => {
    const delay = step * revealMotion.staggerMs;
    return reduceMotion
      ? FadeIn.delay(delay).duration(revealMotion.itemMs).reduceMotion(ReduceMotion.Never)
      : FadeInDown.delay(delay).duration(revealMotion.itemMs).easing(Easing.out(Easing.quad)).reduceMotion(ReduceMotion.Never);
  };
  const thisTry = tryLabel(data.tryNumber);
  const where = [data.category === 'work' ? 'Work' : data.category === 'everyday' ? 'Everyday' : null, thisTry].filter(Boolean).join(' · ');

  return (
    <>
      <View style={styles.list}>
        <View style={styles.topBar}>
          <View style={styles.flex}>
            <Text variant="label">{where}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={actions.onClose} style={styles.close} hitSlop={space.sm}>
            <SymbolView name="xmark" size={17} tintColor={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.title}>
          <Text variant="largeTitle" accessibilityRole="header">
            Before and after
          </Text>
          {data.tryNumber >= 3 ? <Text variant="subheadline">Compared with your first try</Text> : null}
        </View>

        {data.tries === null ? (
          <Text variant="body">{'Your first try was scored before this view existed, so there’s nothing to compare yet.'}</Text>
        ) : (
          <Comparison tries={data.tries} thisTry={thisTry} firstRetry={data.firstRetry} audio={actions.audio} enter={enter} onOpenSteps={() => setStepsOpen(true)} />
        )}
      </View>

      {data.tries ? (
        <FeedbackSheet open={stepsOpen} onClose={() => setStepsOpen(false)} title="Both maps, step by step">
          <BothMaps
            first={{ title: 'First try', map: data.tries.first.map, durationSeconds: data.tries.first.durationSeconds }}
            latest={{ title: capitalised(thisTry), map: data.tries.latest.map, durationSeconds: data.tries.latest.durationSeconds }}
          />
        </FeedbackSheet>
      ) : null}
    </>
  );
}

type Enter = (step: number) => ReturnType<typeof FadeIn.delay>;

function Comparison({
  tries,
  thisTry,
  firstRetry,
  audio,
  enter,
  onOpenSteps,
}: {
  tries: NonNullable<CompareData['tries']>;
  thisTry: string;
  firstRetry: boolean;
  audio: CompareActions['audio'];
  enter: Enter;
  onOpenSteps: () => void;
}) {
  const { colors } = useTheme();
  const { result } = tries;
  const shown = status[result.status];
  const notMeasured = result.status === 'notMeasured';

  return (
    <>
      <Animated.View entering={enter(0)} style={styles.check}>
        {result.tip ? <Text variant="subheadline">{curly(`Your tip: ${result.tip}`)}</Text> : null}
        <View style={styles.status} accessible accessibilityRole="header">
          {shown.symbol ? <SymbolView name={shown.symbol} size={17} weight="semibold" tintColor={colors[shown.color]} /> : null}
          <Text variant="headline" color={shown.color}>
            {shown.text}
          </Text>
        </View>
        <Text variant="title">{curly(result.check)}</Text>
        {notMeasured && audio.ready ? (
          <Pressable
            accessibilityRole="button"
            onPress={audio.toggle}
            style={({ pressed }) => [styles.play, { backgroundColor: colors.fill, opacity: pressed ? 0.6 : 1 }]}>
            <SymbolView name={audio.playing ? 'pause.fill' : 'play.fill'} size={13} tintColor={colors.accentText} />
            <Text variant="body">{audio.playing ? 'Pause' : `Play your ${thisTry}`}</Text>
          </Pressable>
        ) : null}
      </Animated.View>

      <Animated.View entering={enter(1)}>
        <CompareLines
          first={{ title: 'First try', map: tries.first.map, speakingSeconds: tries.first.speakingSeconds }}
          latest={{ title: capitalised(thisTry), map: tries.latest.map, speakingSeconds: tries.latest.speakingSeconds }}
          onOpen={onOpenSteps}
        />
      </Animated.View>

      <Animated.View entering={enter(2)} style={styles.rowsBlock}>
        {notMeasured ? <Text variant="subheadline">Other changes, not part of your tip</Text> : null}
        <View style={[styles.rows, { backgroundColor: colors.surface }]}>
          {result.rows.map((row, i) => (
            <View key={row.id}>
              {i > 0 ? <View style={[styles.divider, { backgroundColor: colors.divider }]} /> : null}
              <Row row={row} />
            </View>
          ))}
        </View>
        <Text variant="label">Off track is time on asides or repeats that add nothing. Stumbles are pauses in the middle of a sentence.</Text>
      </Animated.View>

      {result.nextTip ? (
        <Animated.View entering={enter(3)}>
          <Card>
            <Text variant="label" color="accentText">
              {result.nextTip.heading}
            </Text>
            <Text variant="title">{curly(result.nextTip.tip)}</Text>
          </Card>
        </Animated.View>
      ) : null}

      {firstRetry ? (
        <Animated.View entering={enter(4)}>
          <Text variant="label">{'A second try is easier, because you’ve said it once already. Real progress shows on new questions.'}</Text>
        </Animated.View>
      ) : null}
    </>
  );
}

// "↑ Better" in positive when credited; "↑ Sooner"/"↑ Better" in textPrimary when not; "Same" in textSecondary; the
// wrong way in textPrimary. Only an improvement gets an arrow, and it always points up (DESIGN.md).
function Row({ row }: { row: CompareRow }) {
  const { colors } = useTheme();
  const color: ColorToken = row.credited ? 'positive' : row.trend === 'same' ? 'textSecondary' : 'textPrimary';
  return (
    <View style={styles.row} accessible accessibilityLabel={`${row.word}. ${row.fact}`}>
      <View style={styles.word}>
        {row.trend === 'better' ? <SymbolView name="arrow.up" size={12} weight="semibold" tintColor={colors[color]} /> : null}
        <Text variant="label" strong color={color}>
          {row.word}
        </Text>
      </View>
      <Text variant="body" tabular>
        {row.fact}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.xxl },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  flex: { flex: 1 },
  close: { width: tapTarget, height: tapTarget, alignItems: 'flex-end', justifyContent: 'center' },
  title: { gap: space.xs },
  check: { gap: space.sm },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  play: { minHeight: tapTarget, borderRadius: capsuleRadius, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'flex-start', marginTop: space.sm },
  rowsBlock: { gap: space.md },
  rows: { borderRadius: radius.card },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: space.lg },
  row: { gap: space.xs, paddingVertical: space.md, paddingHorizontal: space.lg },
  word: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
