import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { Card, revealMotion, space, Stat, Text } from '@/design';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import type { Coaching } from '@/lib/schemas/coaching';
import type { Judgement } from '@/lib/schemas/judgement';
import type { Metrics } from '@/lib/schemas/metrics';

import { describeJudgement } from './describeJudgement';
import { describeMetrics } from './describeMetrics';

type Props = { metrics: Metrics; judgement: Judgement | null; coaching: Coaching | null };

// The feedback reveal: results appear one at a time, top to bottom, in the order from DESIGN.md: filler words,
// speed, clear point, the one tip, the better version. Each shows up as soon as the server has saved it, so the
// counted numbers come first and the written parts follow. With Reduce Motion on, results fade in without moving.
export function FeedbackReveal({ metrics, judgement, coaching }: Props) {
  const reduceMotion = useReduceMotion();
  const shownMetrics = describeMetrics(metrics);

  // Results that are already there when the screen opens appear in one top-to-bottom sequence. Results that
  // arrive later start their own sequence from the first one in that group.
  const [atStart] = useState({ judgement: judgement !== null, coaching: coaching !== null });

  const enter = (step: number) => {
    const delay = step * revealMotion.staggerMs;
    return reduceMotion
      ? FadeIn.delay(delay).duration(revealMotion.itemMs).reduceMotion(ReduceMotion.Never)
      : FadeInDown.delay(delay).duration(revealMotion.itemMs).easing(Easing.out(Easing.quad)).reduceMotion(ReduceMotion.Never);
  };

  return (
    <View style={styles.list}>
      <Animated.View entering={enter(0)} style={styles.result}>
        <Stat label="Filler words" value={shownMetrics.fillerCount} />
        {shownMetrics.fillerList ? <Text variant="label">{shownMetrics.fillerList}</Text> : null}
      </Animated.View>

      <Animated.View entering={enter(1)} style={styles.result}>
        <Stat label="Speed" value={shownMetrics.speed} />
        <Text variant="label">{shownMetrics.speedDetail}</Text>
      </Animated.View>

      {judgement ? (
        <Animated.View entering={enter(atStart.judgement ? 2 : 0)} style={styles.result}>
          <Text variant="label">Clear point</Text>
          {describeJudgement(judgement).map((line) => (
            <View key={line.label} style={styles.line} accessible accessibilityLabel={`${line.label}: ${line.value}${line.detail ? `. ${line.detail}` : ''}`}>
              <Text variant="body" color="textSecondary">
                {line.label}
              </Text>
              <Text variant="body">{line.detail ? `${line.value}. ${line.detail}` : line.value}</Text>
            </View>
          ))}
        </Animated.View>
      ) : null}

      {coaching ? (
        <>
          <Animated.View entering={enter(atStart.coaching ? 3 : 0)}>
            <Card>
              <Text variant="label">Your one tip</Text>
              <Text variant="title">{coaching.tip}</Text>
            </Card>
          </Animated.View>
          <Animated.View entering={enter(atStart.coaching ? 4 : 1)} style={styles.result}>
            <Text variant="label">A tighter version of your answer</Text>
            <Text variant="betterVersion">{coaching.betterVersion}</Text>
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.xxl },
  result: { gap: space.sm },
  line: { gap: space.xs },
});
