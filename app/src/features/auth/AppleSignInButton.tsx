import * as AppleAuthentication from 'expo-apple-authentication';
import { StyleSheet } from 'react-native';

import { radius, useTheme } from '@/design';

// Apple requires its own button for Sign in with Apple, so this is the one place we don't use @expo/ui.
// Black in light mode and white in dark mode, as Apple's guidelines ask. Height matches the other buttons.
const buttonHeight = 51;

export function AppleSignInButton({ onPress }: { onPress: () => void }) {
  const { scheme } = useTheme();
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={
        scheme === 'dark'
          ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
          : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
      }
      cornerRadius={radius.button}
      onPress={onPress}
      style={styles.button}
    />
  );
}

const styles = StyleSheet.create({
  button: { alignSelf: 'stretch', height: buttonHeight },
});
