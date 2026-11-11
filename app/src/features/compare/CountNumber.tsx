import { useEffect, useState } from 'react';
import { Easing, useAnimatedReaction, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { compareMotion, Text } from '@/design';
import { useReduceMotion } from '@/hooks/useReduceMotion';

type Props = { from: number; to: number; delayMs?: number; unit?: string };

// A big number that counts from one value to another. The count runs on the UI thread; only each new whole
// number is handed back to React to draw. With Reduce Motion on it just shows the final number.
export function CountNumber({ from, to, delayMs = compareMotion.countDelayMs, unit = '' }: Props) {
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(from);
  const [counted, setCounted] = useState(from);

  useEffect(() => {
    progress.value = from;
    progress.value = withDelay(delayMs, withTiming(to, { duration: compareMotion.countMs, easing: Easing.out(Easing.cubic) }));
  }, [from, to, delayMs, progress]);

  useAnimatedReaction(
    () => Math.round(progress.value),
    (now, before) => {
      if (now !== before) scheduleOnRN(setCounted, now);
    },
  );

  return (
    <Text variant="bigNumber" accessibilityLabel={`${to}${unit}`}>
      {reduceMotion ? to : counted}{unit}
    </Text>
  );
}
