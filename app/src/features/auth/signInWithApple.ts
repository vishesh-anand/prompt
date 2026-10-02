import * as AppleAuthentication from 'expo-apple-authentication';

import { supabase } from '@/lib/supabase';

// Shows Apple's sheet, then trades Apple's signed token for a Supabase login.
// Returns false if you dismissed the sheet (not an error). Throws if something actually failed.
export async function signInWithApple(): Promise<boolean> {
  try {
    // Email only: the app doesn't need your name (PRODUCT.md, "only what's needed").
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
    if (!credential.identityToken) throw new Error('Apple did not return a token.');
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken });
    if (error) throw error;
    return true;
  } catch (e) {
    if (typeof e === 'object' && e !== null && 'code' in e && e.code === 'ERR_REQUEST_CANCELED') return false;
    throw e;
  }
}
