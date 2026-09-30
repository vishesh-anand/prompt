import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, Text, space } from '@/design';

// Placeholder until the real Home screen (build step 7).
export default function Index() {
  const router = useRouter();
  return (
    <Screen>
      <View style={styles.center}>
        <Text variant="title">Prompt</Text>
      </View>
      <View style={styles.actions}>
        <Button label="Answer today's question" onPress={() => router.push('/record')} />
        {__DEV__ ? <Button variant="secondary" label="Design preview" onPress={() => router.push('/dev/design')} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
