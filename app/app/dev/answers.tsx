import { useQuery } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';

import { Button, Screen, Text, space } from '@/design';
import { supabase } from '@/lib/supabase';

// Development builds only: your past answers, newest first, each opening its feedback screen. The app has no list of past
// answers yet (Progress comes in step F), and this is how an old answer's feedback is looked at on the phone.
const rowSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  retry_of: z.string().nullable(),
  question: z.object({ text: z.string() }).nullable(),
});

export default function PastAnswers() {
  const router = useRouter();
  const answers = useQuery({
    queryKey: ['dev-past-answers'],
    enabled: __DEV__,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('answers')
        .select('id, created_at, retry_of, question:questions(text)')
        .eq('status', 'coached')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return z.array(rowSchema).parse(data);
    },
  });

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <Screen scroll>
      <View style={styles.list}>
        <Text variant="title">Past answers</Text>
        {answers.isPending ? <Text variant="body">Loading.</Text> : null}
        {answers.isError ? <Text variant="body">That didn’t load.</Text> : null}
        {answers.data?.map((row) => (
          <View key={row.id} style={styles.item}>
            <Text variant="label">
              {`${new Date(row.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}${row.retry_of ? ' · retry' : ''}`}
            </Text>
            <Button
              variant="secondary"
              label={(row.question?.text ?? 'An answer').slice(0, 60)}
              onPress={() => router.push({ pathname: '/feedback/[answerId]', params: { answerId: row.id } })}
            />
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.lg },
  item: { gap: space.xs },
});
