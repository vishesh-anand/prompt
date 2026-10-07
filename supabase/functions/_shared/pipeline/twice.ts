// Each stage gets one more try before the answer is marked failed. `onAttemptFailed` lets the evals count retries.
export async function twice<T>(attempt: () => Promise<T>, onAttemptFailed?: (error: Error) => void): Promise<T> {
  let lastError = new Error('stage did not run');
  for (let i = 0; i < 2; i++) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      onAttemptFailed?.(lastError);
    }
  }
  throw lastError;
}
