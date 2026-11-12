import { BottomSheet, Group, Host, RNHostView } from '@expo/ui/swift-ui';
import { presentationBackground, presentationDetents, presentationDragIndicator } from '@expo/ui/swift-ui/modifiers';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, screenMargin, space, useTheme , tapTarget } from '@/design';


type Props = { open: boolean; onClose: () => void; title: string; children: ReactNode };

// One of the feedback screen's sheets (Step by step, Shorter and clearer, How it sounded): Apple's own sheet with a
// grabber, holding our own content. It lives inside the feedback screen, so its time buttons share the screen's one
// audio player. Always full height with a scrolling body: a sheet sized to its content can't scroll, and at large text
// sizes it squeezes the words (checked on the simulator in the step D2 spike). The title wraps so Done stays on screen.
export function FeedbackSheet({ open, onClose, title, children }: Props) {
  const { colors } = useTheme();
  const { bottom } = useSafeAreaInsets();
  return (
    // A 1-point anchor: the sheet itself covers the screen. ignoreSafeArea as on every Host (CLAUDE.md).
    <Host ignoreSafeArea="all" style={styles.anchor}>
      <BottomSheet isPresented={open} onIsPresentedChange={(presented) => !presented && onClose()}>
        <Group modifiers={[presentationDetents(['large']), presentationDragIndicator('visible'), presentationBackground(colors.surface)]}>
          <RNHostView>
            <View style={[styles.fill, { backgroundColor: colors.surface }]}>
              <View style={styles.header}>
                <View style={styles.title}>
                  <Text variant="title" accessibilityRole="header">
                    {title}
                  </Text>
                </View>
                <Pressable accessibilityRole="button" onPress={onClose} style={styles.done} hitSlop={space.sm}>
                  <Text variant="headline" color="accentText">
                    Done
                  </Text>
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={[styles.body, { paddingBottom: bottom + space.xl }]}>{children}</ScrollView>
            </View>
          </RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  );
}

const styles = StyleSheet.create({
  anchor: { width: 1, height: 1 },
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: screenMargin, paddingTop: space.xl, paddingBottom: space.lg },
  title: { flex: 1 },
  done: { minHeight: tapTarget, justifyContent: 'center' },
  body: { paddingHorizontal: screenMargin, gap: space.xl },
});
