import { Button as NativeButton, Host, Text as NativeText } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as accessibilityLabelModifier,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  foregroundStyle,
  frame,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { StyleSheet, useWindowDimensions } from 'react-native';

import { radius } from '../spacing';
import { useTheme } from '../theme';

// Stretches the label, and with it the button. SwiftUI clamps this to the width it is offered.
// Infinity can't be used: it becomes null over the JS bridge.
const fillWidth = 10000;

// A large SwiftUI button is one 17pt text line (20.34pt at default size) plus 30pt of padding.
// We give the Host this height up front instead of letting it measure itself (matchContents), which
// reports a height of 0 for the first moments.
const buttonPadding = 30;
const buttonLineHeight = 20.34;

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
  const { fontScale } = useWindowDimensions();
  const isPrimary = variant === 'primary';
  const isQuiet = variant === 'quiet';
  const height = Math.ceil(buttonPadding + buttonLineHeight * fontScale);

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
        <NativeText modifiers={[frame({ maxWidth: fillWidth }), ...(isPrimary ? [foregroundStyle(colors.onAccent)] : [])]}>
          {label}
        </NativeText>
      </NativeButton>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: { alignSelf: 'stretch' },
});
