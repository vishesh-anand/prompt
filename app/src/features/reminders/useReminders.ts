import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useSession } from '@/features/auth/AuthProvider';
import { invalidateAnswers } from '@/features/history/invalidateAnswers';
import { useHistory } from '@/features/history/useHistory';
import { useProfile } from '@/features/profile/useProfile';
import { streak } from '@/features/streak/streak';

import { reminderDates } from './reminderPlan';
import { scheduleReminders } from './scheduleReminders';
import { parseTime } from './timeOfDay';

// A reminder that arrives while the app is open still shows as a banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

// Mounted once, at the root. Keeps the phone's reminders in step with your chosen time and with whether you have practiced
// today: the next 30 days are scheduled, minus today if you already answered. Runs again whenever your answers change or
// the app comes back to the front (a new day may have started).
export function useReminders() {
  const queryClient = useQueryClient();
  const reminderTime = useProfile().data?.reminder_time ?? null;
  const history = useHistory().data;
  const signedOut = useSession().session === null;
  const [cameToFront, setCameToFront] = useState(0);
  // The plan last handed to the phone. The same plan again (the app came to the front, nothing changed) is not sent twice.
  const applied = useRef<string | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void invalidateAnswers(queryClient);
      setCameToFront((n) => n + 1);
    });
    return () => subscription.remove();
  }, [queryClient]);

  // Signing out takes the reminders with it, so they don't keep arriving for a signed-out phone.
  useEffect(() => {
    if (!signedOut) return;
    applied.current = null;
    scheduleReminders([]).catch(() => {});
  }, [signedOut]);

  useEffect(() => {
    // Not set up yet, or answers haven't loaded: leave whatever is scheduled alone.
    if (reminderTime === null || history === undefined) return;
    const now = new Date();
    const plan = reminderDates(now, parseTime(reminderTime), streak(history, now).practicedToday);
    const key = plan.map((date) => date.getTime()).join();
    if (key === applied.current) return;
    applied.current = key;
    // If the phone didn't take the plan (notifications are off, or a call failed), forget it, so the next time the app comes to
    // the front tries again, for instance after you turn notifications on in Settings. Only forget this plan, not a newer one.
    const forget = () => {
      if (applied.current === key) applied.current = null;
    };
    scheduleReminders(plan)
      .then((scheduled) => {
        if (!scheduled) forget();
      })
      .catch(forget);
  }, [reminderTime, history, cameToFront]);
}
