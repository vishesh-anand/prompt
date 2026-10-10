import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, Text, space } from '@/design';
import { useProfile } from '@/features/profile/useProfile';
import { notificationStatus, scheduledReminderDates, sendTestReminder } from '@/features/reminders/scheduleReminders';
import { localDayKey } from '@/features/streak/streak';

// Development and scripted-test builds only: shows what the phone has scheduled, so the end-to-end run can check reminders
// without waiting for one to arrive. Testers never see it.
export default function Reminders() {
  const profile = useProfile();
  const [dates, setDates] = useState<Date[] | null>(null);
  const [permission, setPermission] = useState('unknown');

  useEffect(() => {
    void scheduledReminderDates().then(setDates);
    void notificationStatus().then(setPermission);
  }, [profile.data?.reminder_time]);

  if (!__DEV__ && process.env.EXPO_PUBLIC_E2E !== '1') return <Redirect href="/" />;

  const today = localDayKey(new Date());
  const hasToday = dates?.some((d) => localDayKey(d) === today);
  return (
    <Screen scroll>
      <View style={styles.content}>
        <Text variant="title">Reminders</Text>
        <Text variant="body">{`Reminder time: ${profile.data?.reminder_time ?? 'not set'}`}</Text>
        <Text variant="body">{`Timezone: ${profile.data?.timezone ?? 'not set'}`}</Text>
        <Text variant="body">{`Notifications: ${permission}`}</Text>
        <Text variant="body">{dates === null ? 'Reading reminders' : `Reminders scheduled: ${dates.length}`}</Text>
        <Text variant="body">{dates === null ? '' : `Reminder today: ${hasToday ? 'yes' : 'no'}`}</Text>
        <Button variant="secondary" label="Send a test reminder in 10 seconds" onPress={() => void sendTestReminder()} />
        {(dates ?? []).slice(0, 3).map((d) => (
          <Text key={d.getTime()} variant="label">{`Next: ${d.toString()}`}</Text>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md },
});
