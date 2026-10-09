import { Directory, File, Paths } from 'expo-file-system';
import { z } from 'zod';

// Test builds only (EXPO_PUBLIC_E2E=1 when the bundle is made). A simulator has no voice, so the scripted end-to-end run
// puts spoken clips in the app's Documents/e2e folder and the recorder's result is swapped for one of them.
// Normal builds don't set the flag, so Metro inlines `false` here and this file does nothing.
const enabled = process.env.EXPO_PUBLIC_E2E === '1';

const lengthSchema = z.object({ durationMs: z.number() });

// The first take of a run gets the clip with fillers, every later take gets the tighter one, so a retry has something to compare.
let takesSoFar = 0;

// A copy, never the clip itself: saving a take moves its file.
export function e2eTake(): { uri: string; durationMs: number } | null {
  if (!enabled) return null;
  const name = takesSoFar === 0 ? 'first' : 'retry';
  const folder = new Directory(Paths.document, 'e2e');
  const clip = new File(folder, `${name}.m4a`);
  const length = new File(folder, `${name}.json`);
  if (!clip.exists || !length.exists) return null;
  const copy = new File(Paths.cache, `e2e-${Date.now()}.m4a`);
  clip.copySync(copy);
  takesSoFar += 1;
  return { uri: copy.uri, ...lengthSchema.parse(JSON.parse(length.textSync())) };
}
