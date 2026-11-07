import { Button as NativeButton, Host, Text as NativeText } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as accessibilityLabelModifier,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  foregroundStyle,
  frame,
  lineLimit,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { StyleSheet, useWindowDimensions } from 'react-native';

import { radius, screenMargin } from '../spacing';
import { useTheme } from '../theme';

// Stretches the label, and with it the button. SwiftUI clamps this to the width it is offered.
// Infinity can't be used: it becomes null over the JS bridge.
const fillWidth = 10000;

// A large SwiftUI button is one 17pt text line (20.34pt at default size) plus 30pt of padding.
// We give the Host this height up front instead of letting it measure itself (matchContents), which
// reports a height of 0 for the first moments.
const buttonPadding = 30;
const buttonLineHeight = 20.34;

// A long label wraps at large text sizes instead of being cut off ("Try again w…"). The Host has a fixed height, so the
// number of lines is estimated up front from the label's length, the text scale and the width, always on the high side:
// a spare line only adds padding, a missing one cuts the words. About 9 points a character at the default size, 40 points
// of the button's own padding, at most 3 lines (the largest accessibility size).
const charWidth = 9;
const buttonSidePadding = 40;
const maxLines = 3;
export function labelLines(label: string, fontScale: number, windowWidth: number): number {
  const room = Math.max(windowWidth - screenMargin * 2 - buttonSidePadding, 1);
  return Math.min(maxLines, Math.max(1, Math.ceil((label.length * charWidth * fontScale) / room)));
}

type Props = {
  label: string;
  onPress: () => void;
  // primary is the one coral button per screen; secondary is outlined; quiet is plain text for the least important actions.
  variant?: 'primary' | 'secondary' | 'quiet';
  accessibilityLabel?: string;
};

// A native SwiftUI button. Full width, 12pt corners.
export function Button({ label, onPress, variant = 'primary', accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const { fontScale, width } = useWindowDimensions();
  const isPrimary = variant === 'primary';
  const isQuiet = variant === 'quiet';
  const lines = labelLines(label, fontScale, width);
  const height = Math.ceil(buttonPadding + buttonLineHeight * fontScale * lines);

  return (
    // ignoreSafeArea: a Host that starts below the screen edge (e.g. lower in a scroll view) picks up the
    // home-indicator inset and draws its content ~17pt too high until the next re-render. Ignore it.
    <Host ignoreSafeArea="all" style={[styles.host, { height }]}>
      <NativeButton
        onPress={onPress}
        modifiers={[
          buttonStyle(isPrimary ? 'borderedProminent' : isQuiet ? 'borderless' : 'bordered'),
          buttonBorderShape('roundedRectangle', radius.button),
          controlSize('large'),
          tint(isPrimary ? colors.accent : isQuiet ? colors.textSecondary : colors.textPrimary),
          accessibilityLabelModifier(accessibilityLabel ?? label),
        ]}>
        {/* Dark label on coral: white fails contrast (see DESIGN.md, onAccent). */}
        <NativeText modifiers={[frame({ maxWidth: fillWidth }), lineLimit(lines), ...(isPrimary ? [foregroundStyle(colors.onAccent)] : [])]}>
          {label}
        </NativeText>
      </NativeButton>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: { alignSelf: 'stretch' },
});
