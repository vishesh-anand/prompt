import { StyleSheet, View } from 'react-native';

import { Screen, Text, space } from '@/design';
import { AppleSignInButton } from '@/features/auth/AppleSignInButton';
import { useAppleSignIn } from '@/features/auth/useAppleSignIn';

export default function SignIn() {
  const { signIn, failed } = useAppleSignIn();
  return (
    <Screen>
      <View style={styles.center}>
        <Text variant="title">Prompt</Text>
        <Text variant="body" color="textSecondary">
          Answer one question out loud each day.
        </Text>
      </View>
      <View style={styles.actions}>
        {failed ? (
          <Text variant="body" color="textSecondary">
            {"Sign in didn't finish. Check your connection and try again."}
          </Text>
        ) : null}
        <AppleSignInButton onPress={() => void signIn()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  actions: { gap: space.md },
});
