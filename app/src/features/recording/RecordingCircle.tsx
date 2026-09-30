import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { recordCircle, recordingMotion, space, useTheme } from '@/design';

import { maxAnswerMs } from './limits';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const ringRadius = (recordCircle.core / 2) * recordingMotion.coreMaxScale + space.md;
const ringCircumference = 2 * Math.PI * ringRadius;
const ringBox = 2 * ringRadius + recordCircle.ringStroke;

type Props = {
  recording: boolean;
  // Loudness, 0 (silent) to 1 (loud).
  level: number;
  onPress: () => void;
};

// The soft coral circle. Grows and settles with your voice; a thin ring fills over the 60 seconds.
export function RecordingCircle({ recording, level, onPress }: Props) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();

  // Reanimated would otherwise skip these animations under Reduce Motion. We handle it ourselves:
  // no scaling, and the glow fades instead. The ring keeps filling because it shows the time left.
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
      progress.set(withTiming(1, { duration: maxAnswerMs, easing: Easing.linear, reduceMotion: ReduceMotion.Never }));
    }
  }, [recording, progress]);

  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : 1 + (recordingMotion.coreMaxScale - 1) * smoothed.get() }],
  }));

  const glowStyle = useAnimatedStyle(() => {
    const scale = recordingMotion.glowRestScale + (recordingMotion.glowMaxScale - recordingMotion.glowRestScale) * smoothed.get();
    return reduceMotion
      ? { transform: [{ scale: recordingMotion.glowRestScale }], opacity: recordingMotion.glowRestOpacity + (1 - recordingMotion.glowRestOpacity) * smoothed.get() }
      : { transform: [{ scale }], opacity: 1 };
  });

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: ringCircumference * (1 - progress.get()),
  }));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
      accessibilityHint="Up to 60 seconds"
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
