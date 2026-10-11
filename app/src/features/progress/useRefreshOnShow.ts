import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

// Runs `refresh` each time the tab is shown again. Not the first time: everything is already loading then, and a second
// request would only be refused the claim and told the note is not ready.
export function useRefreshOnShow(refresh: () => void) {
  const shownBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (shownBefore.current) refresh();
      shownBefore.current = true;
    }, [refresh]),
  );
}
