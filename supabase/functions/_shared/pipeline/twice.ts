// Each stage gets one more try before the answer is marked failed. `onAttemptFailed` lets the evals count retries.
// The second try is told what went wrong with the first, so a stage that talks to a model can pass that on.
export async function twice<T>(attempt: (previousError: Error | null) => Promise<T>, onAttemptFailed?: (error: Error) => void): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i < 2; i++) {
    try {
      return await attempt(lastError);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      onAttemptFailed?.(lastError);
    }
  }
  throw lastError ?? new Error('stage did not run');
}

// What went wrong, short enough to hand back to the model. The SDK's error for a reply that doesn't fit the schema
// is long JSON that ends in a plain "Validation issues:" list, which is the useful part.
export function problemOf(error: Error): string {
  const issues = error.message.split('Validation issues:')[1];
  return (issues ?? error.message).trim().slice(0, 300);
}
