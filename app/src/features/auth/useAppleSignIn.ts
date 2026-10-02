import { useState } from 'react';

import { signInWithApple } from './signInWithApple';

export function useAppleSignIn() {
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await signInWithApple();
    } catch (e) {
      // The screen shows a calm message; the real reason goes to the dev terminal.
      if (__DEV__) console.warn('Sign in with Apple failed:', e);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return { signIn, failed };
}
