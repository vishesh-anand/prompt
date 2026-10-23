import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { recordCircle, recordingMotion, space, useTheme } from '@/design';
import { useReduceMotion } from '@/hooks/useReduceMotion';

import { limitHint } from './limits';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const ringRadius = (recordCircle.core / 2) * recordingMotion.coreMaxScale + space.md;
const ringCircumference = 2 * Math.PI * ringRadius;
const ringBox = 2 * ringRadius + recordCircle.ringStroke;

type Props = {
  recording: boolean;
  // Loudness, 0 (silent) to 1 (loud).
  level: number;
  onPress: () => void;
  // How long the answer can be. The ring fills over this time.
  limitMs: number;
  // Home uses the circle too, as the way in to today's answer.
  accessibilityLabel?: string;
};

// The soft coral circle. Grows and settles with your voice; a thin ring fills as the time runs out.
export function RecordingCircle({ recording, level, onPress, limitMs, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();

  // Reanimated would otherwise skip these animations under Reduce Motion. We handle it ourselves:
  // nothing scales, and the coral circle fades with your voice instead. The ring keeps filling because it shows the time left.
  const smoothed = useSharedValue(0);
  const progress = useSharedValue(0);
  const lastLevel = useRef(0);

  useEffect(() => {
    const rising = level > lastLevel.current;
    lastLevel.current = level;
    smoothed.set(
      withTiming(level, {
        duration: rising ? recordingMotion.levelRiseMs : recordingMotion.levelFallMs,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [level, smoothed]);

  useEffect(() => {
    cancelAnimation(progress);
    progress.set(0);
    if (recording) {
      progress.set(withTiming(1, { duration: limitMs, easing: Easing.linear, reduceMotion: ReduceMotion.Never }));
    }
  }, [recording, progress, limitMs]);

  // Reduce Motion: nothing moves. The halo stays put and the coral circle fades brighter with your voice.
  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : 1 + (recordingMotion.coreMaxScale - 1) * smoothed.get() }],
    opacity: reduceMotion ? recordingMotion.reducedCoreRestOpacity + (1 - recordingMotion.reducedCoreRestOpacity) * smoothed.get() : 1,
  }));

  const glowStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { transform: [{ scale: recordingMotion.reducedGlowScale }] };
    const scale = recordingMotion.glowRestScale + (recordingMotion.glowMaxScale - recordingMotion.glowRestScale) * smoothed.get();
    return { transform: [{ scale }] };
  });

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: ringCircumference * (1 - progress.get()),
  }));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (recording ? 'Stop recording' : 'Start recording')}
      accessibilityHint={limitHint(limitMs)}
      style={styles.box}>
      <Animated.View style={[styles.glow, { backgroundColor: colors.accentSoft }, glowStyle]} />
      <Animated.View style={[styles.core, { backgroundColor: colors.accent }, coreStyle]} />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={ringBox} height={ringBox}>
          <AnimatedCircle
            cx={ringBox / 2}
            cy={ringBox / 2}
            r={ringRadius}
            stroke={colors.accent}
            strokeWidth={recordCircle.ringStroke}
            strokeLinecap="round"
            strokeDasharray={ringCircumference}
            fill="none"
            rotation={-90}
            origin={`${ringBox / 2}, ${ringBox / 2}`}
            animatedProps={ringProps}
          />
        </Svg>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { width: ringBox, height: ringBox, alignItems: 'center', justifyContent: 'center' },
  core: { position: 'absolute', width: recordCircle.core, height: recordCircle.core, borderRadius: recordCircle.core / 2 },
  glow: { position: 'absolute', width: recordCircle.core, height: recordCircle.core, borderRadius: recordCircle.core / 2 },
});
