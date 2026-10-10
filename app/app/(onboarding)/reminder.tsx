import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, Text, TimePicker, space } from '@/design';
import { useHistory } from '@/features/history/useHistory';
import { useSaveReminder } from '@/features/profile/useSaveReminder';
import { pickQuestion } from '@/features/questions/pickQuestion';
import { useQuestions } from '@/features/questions/useQuestions';
import { dateToTime, defaultReminder, timeToDate } from '@/features/reminders/timeOfDay';

// First-time setup: when should we remind you? Then straight into your first answer, which becomes your starting point.
export default function Reminder() {
  const router = useRouter();
  const [time, setTime] = useState(() => timeToDate(defaultReminder));
  const save = useSaveReminder();
  const questions = useQuestions();
  const history = useHistory();

  function next() {
    save.mutate(dateToTime(time), {
      onSuccess: async () => {
        // Continue can be tapped before these have loaded (a slow connection); ask again rather than skip your first question.
        const [list, answers] = await Promise.all([
          questions.data ?? questions.refetch().then((r) => r.data),
          history.data ?? history.refetch().then((r) => r.data),
        ]);
        const first = list ? pickQuestion(list, answers ?? [], 'work') : null;
        if (first) router.replace({ pathname: '/record', params: { questionId: String(first.id) } });
        else router.replace('/');
      },
    });
  }

  return (
    <Screen>
      <View style={styles.top}>
        <Text variant="title">When should we remind you?</Text>
        <Text variant="body" color="textSecondary">
          {"One reminder a day, and only if you haven't practiced yet."}
        </Text>
        <TimePicker value={time} onChange={setTime} accessibilityLabel="Reminder time" />
      </View>
      <View style={styles.actions}>
        <Text variant="body" color="textSecondary">
          Your first answer becomes your starting point, so you can see how far you come.
        </Text>
        {save.isError ? <Text variant="body">{"That didn't save. Check your connection and try again."}</Text> : null}
        <Button label="Continue" onPress={next} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flex: 1, gap: space.xl },
  actions: { gap: space.md },
});
