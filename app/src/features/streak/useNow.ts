import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

// The current time, refreshed whenever the app comes back to the front, so a day that changed while the app was
// asleep (and a streak that lapsed with it) shows up without anything else having to change.
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(new Date());
    });
    return () => subscription.remove();
  }, []);
  return now;
}
