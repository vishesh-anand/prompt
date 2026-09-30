import type { Take } from './useRecording';

// Temporary hand-off from the record screen to the replay screen, kept in memory so no link can supply a file path.
// Build step 3 replaces this: the replay screen will load the answer by its id.
let lastTake: Take | null = null;

export function setLastTake(take: Take | null) {
  lastTake = take;
}

export function getLastTake(): Take | null {
  return lastTake;
}
