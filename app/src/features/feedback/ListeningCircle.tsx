import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { recordCircle, recordingMotion, revealMotion, useTheme } from '@/design';
import { useReduceMotion } from '@/hooks/useReduceMotion';

// The waiting state: the recording circle, slowly settling and fading while feedback is prepared.
// Not a spinner. With Reduce Motion on it only fades; nothing scales.
export function ListeningCircle() {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const settle = useSharedValue(0);

  useEffect(() => {
    settle.set(withTiming(1, { duration: revealMotion.listeningSettleMs, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never }));
  }, [settle]);

  const coreStyle = useAnimatedStyle(() => ({
    opacity: 1 - (1 - revealMotion.listeningRestOpacity) * settle.get(),
    transform: [{ scale: reduceMotion ? 1 : revealMotion.listeningStartScale - (revealMotion.listeningStartScale - 1) * settle.get() }],
  }));

  return (
    <View style={styles.box} accessible accessibilityLabel="Listening to your answer">
      <View style={[styles.glow, { backgroundColor: colors.accentSoft }]} />
      <Animated.View style={[styles.core, { backgroundColor: colors.accent }, coreStyle]} />
    </View>
  );
}

const size = recordCircle.core;
const styles = StyleSheet.create({
  box: { width: size * recordingMotion.glowRestScale, height: size * recordingMotion.glowRestScale, alignItems: 'center', justifyContent: 'center' },
  core: { position: 'absolute', width: size, height: size, borderRadius: size / 2 },
  glow: { position: 'absolute', width: size * recordingMotion.glowRestScale, height: size * recordingMotion.glowRestScale, borderRadius: (size * recordingMotion.glowRestScale) / 2 },
});
