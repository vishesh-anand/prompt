import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

type MicStatus = 'checking' | 'granted' | 'denied';

// iOS shows its microphone prompt only once. If it was denied, the only way back is the Settings app.
// We check on mount. Unverified: whether iOS restarts the app when the switch changes in Settings.
export function useMicPermission(): { status: MicStatus; openSettings: () => void } {
  const [status, setStatus] = useState<MicStatus>('checking');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let permission = await getRecordingPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) {
        permission = await requestRecordingPermissionsAsync();
      }
      if (!cancelled) setStatus(permission.granted ? 'granted' : 'denied');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { status, openSettings: () => void Linking.openSettings() };
}
