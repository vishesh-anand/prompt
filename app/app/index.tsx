import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, Text } from '@/design';

// Placeholder until the real Home screen (build step 7).
export default function Index() {
  const router = useRouter();
  return (
    <Screen>
      <View style={styles.center}>
        <Text variant="title">Prompt</Text>
      </View>
      {__DEV__ ? <Button variant="secondary" label="Design preview" onPress={() => router.push('/dev/design')} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
