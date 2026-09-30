import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// Follows the iPhone's Reduce Motion setting, including changes made while the app is open.
// (Reanimated's own useReducedMotion only reads the setting when the app starts.)
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
