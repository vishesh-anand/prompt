import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, Text, space } from '@/design';
import { usePendingAnswers, useUploadPending } from '@/features/answers/usePendingAnswers';
import { supabase } from '@/lib/supabase';

// Placeholder until the real Home screen (build step 7).
export default function Index() {
  const router = useRouter();
  const pending = usePendingAnswers().data?.[0];
  const upload = useUploadPending();

  function retryUpload() {
    if (!pending) return;
    upload.mutate(pending, {
      onSuccess: (answerId) => router.push({ pathname: '/feedback/[answerId]', params: { answerId } }),
    });
  }

  return (
    <Screen>
      <View style={styles.center}>
        <Text variant="title">Prompt</Text>
        {pending ? (
          <Text variant="body" color="textSecondary" >
            {"That didn't upload. Your recording is saved. Tap to try again."}
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        {pending ? (
          <Button label="Try again" onPress={retryUpload} />
        ) : (
          <Button label="Answer today's question" onPress={() => router.push('/record')} />
        )}
        {__DEV__ ? (
          <>
            <Button variant="secondary" label="Design preview" onPress={() => router.push('/dev/design')} />
            <Button variant="secondary" label="Sign out" onPress={() => void supabase.auth.signOut()} />
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
});
