import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, Text, TimePicker, space } from '@/design';
import { useFinishSetup } from '@/features/profile/useFinishSetup';
import { defaultReminder, timeToDate } from '@/features/reminders/timeOfDay';

// First-time setup: when should we remind you? Then straight into your first answer, which becomes your starting point.
export default function Reminder() {
  const [time, setTime] = useState(() => timeToDate(defaultReminder));
  const { finish, failed } = useFinishSetup();

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
        {failed ? <Text variant="body">{"That didn't save. Check your connection and try again."}</Text> : null}
        <Button label="Continue" onPress={() => finish(time)} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flex: 1, gap: space.xl },
  actions: { gap: space.md },
});
