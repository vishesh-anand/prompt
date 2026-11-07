import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { Button, Text, revealMotion, space } from '@/design';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import type { Coaching } from '@/lib/schemas/coaching';
import type { AnswerMap } from '@/lib/schemas/map';
import type { Metrics } from '@/lib/schemas/metrics';
import { curly } from '@/lib/typography';

import { AnswerLine } from './AnswerLine';
import { headline } from './answerShape';
import { FeedbackRows, ListenerCard, lengthOf, type Row, TipCard } from './FeedbackCards';
import { FeedbackSheet } from './FeedbackSheet';
import { shorterSubtitle, soundedLines, soundedSummary } from './feedbackText';
import { Shorter, Sounded, StepByStep } from './SheetContents';
import { tapTarget } from './sizes';

export type FeedbackData = {
  category: 'work' | 'everyday' | null;
  isRetry: boolean;
  question: string | null;
  map: AnswerMap | null;
  metrics: Metrics | null;
  coaching: Coaching | null;
  durationMs: number;
  timeRanOut: boolean;
  listenerConfirmed: boolean | null;
};

export type FeedbackActions = {
  onDone: () => void;
  onConfirm: (meant: boolean) => void;
  audio: { ready: boolean; playing: boolean; toggle: () => void; playMoment: ((atSeconds: number) => void) | null };
  // "This feedback is wrong", once everything is in.
  flag: { flagged: boolean; onFlag: () => void } | null;
  // One calm line under the results: still writing, or the rest didn't finish.
  note: string | null;
};

type Sheet = 'steps' | 'shorter' | 'sounded' | null;

// The feedback reveal (DESIGN.md, Feedback reveal): top to bottom, each part appearing as soon as its pipeline stage
// has saved it. Parts already there when the screen opens appear one after another (0.12 s apart); a part that arrives
// later starts its own sequence. With Reduce Motion on, parts fade in without moving. "Try again with this tip" is not
// here: the screen pins it below the scroll.
export function FeedbackReveal({ data, actions }: { data: FeedbackData; actions: FeedbackActions }) {
  const { map, metrics, coaching } = data;
  const reduceMotion = useReduceMotion();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [atStart] = useState({ map: map !== null, coaching: coaching !== null });

  const enter = (step: number) => {
    const delay = step * revealMotion.staggerMs;
    return reduceMotion
      ? FadeIn.delay(delay).duration(revealMotion.itemMs).reduceMotion(ReduceMotion.Never)
      : FadeInDown.delay(delay).duration(revealMotion.itemMs).easing(Easing.out(Easing.quad)).reduceMotion(ReduceMotion.Never);
  };
  // The order of the map's parts, and of the coach's parts, from the moment each group arrived.
  const fromMap = (n: number) => enter(atStart.map ? 1 + n : n);
  const fromCoach = (n: number) => enter(atStart.coaching ? 4 + n : n);

  const lines = map && metrics ? soundedLines(map, metrics) : [];
  const lost = map && map.version >= 9 && map.didntFollow[0] ? { atSeconds: map.didntFollow[0].atSeconds ?? null, why: map.didntFollow[0].why } : null;
  const where = [data.category === 'work' ? 'Work' : data.category === 'everyday' ? 'Everyday' : null, data.isRetry ? 'second try' : 'first try'].filter(Boolean).join(' · ');

  const rows: Row[] = [
    ...(coaching ? [{ title: 'Shorter and clearer', subtitle: shorterSubtitle(map, coaching.betterSteps), kind: 'opens' as const, onPress: () => setSheet('shorter') }] : []),
    ...(lines.length > 0 ? [{ title: 'How it sounded', subtitle: soundedSummary(lines.length), kind: 'opens' as const, onPress: () => setSheet('sounded') }] : []),
    ...(actions.audio.ready ? [{ title: 'Play your answer', detail: lengthOf(data.durationMs), kind: 'plays' as const, playing: actions.audio.playing, onPress: actions.audio.toggle }] : []),
  ];

  return (
    <View style={styles.list}>
      <View style={styles.topBar}>
        <View style={styles.flex}>
          <Text variant="label">{where}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={actions.onDone} style={styles.done} hitSlop={space.sm}>
          <Text variant="headline" color="accentText">
            Done
          </Text>
        </Pressable>
      </View>

      <Animated.View entering={enter(0)} style={styles.top}>
        {data.question ? <Text variant="betterVersion">{curly(`"${data.question}"`)}</Text> : null}
        {map ? (
          <Animated.View entering={fromMap(0)} style={styles.top}>
            <Text variant="headline">{headline(map)}</Text>
            <AnswerLine steps={map.steps} speakingSeconds={metrics?.speakingSeconds ?? 0} timeRanOut={data.timeRanOut} onOpen={() => setSheet('steps')} />
          </Animated.View>
        ) : null}
      </Animated.View>

      {map || coaching ? (
        <Animated.View entering={fromMap(1)}>
          <TipCard coaching={coaching} />
        </Animated.View>
      ) : null}

      {map ? (
        <Animated.View entering={fromMap(2)}>
          <ListenerCard
            restatement={map.point.restatement}
            confirmed={data.listenerConfirmed}
            onConfirm={actions.onConfirm}
            lost={lost}
            onPlay={actions.audio.playMoment}
          />
        </Animated.View>
      ) : null}

      {rows.length > 0 ? (
        <Animated.View entering={coaching ? fromCoach(0) : fromMap(3)}>
          <FeedbackRows rows={rows} />
        </Animated.View>
      ) : null}

      {actions.note ? <Text variant="label">{actions.note}</Text> : null}

      {actions.flag ? (
        <Animated.View entering={fromCoach(1)}>
          <Button
            variant="quiet"
            label={actions.flag.flagged ? 'Thanks. We’ll look at this answer.' : 'This feedback is wrong'}
            onPress={() => (actions.flag?.flagged ? undefined : actions.flag?.onFlag())}
          />
        </Animated.View>
      ) : null}

      {map ? (
        <FeedbackSheet open={sheet === 'steps'} onClose={() => setSheet(null)} title="Step by step">
          <StepByStep map={map} better={coaching?.betterSteps} durationSeconds={data.durationMs / 1000} />
        </FeedbackSheet>
      ) : null}
      {coaching ? (
        <FeedbackSheet open={sheet === 'shorter'} onClose={() => setSheet(null)} title="Shorter and clearer">
          <Shorter coaching={coaching} />
        </FeedbackSheet>
      ) : null}
      {lines.length > 0 ? (
        <FeedbackSheet open={sheet === 'sounded'} onClose={() => setSheet(null)} title="How it sounded">
          <Sounded lines={lines} onPlay={actions.audio.playMoment} />
        </FeedbackSheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.lg },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  flex: { flex: 1 },
  done: { minHeight: tapTarget, justifyContent: 'center' },
  top: { gap: space.md, paddingBottom: space.sm },
});
