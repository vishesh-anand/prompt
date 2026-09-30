// "That was 6 seconds." Rounds down so a 9.6 second take never reads as 10.
export function tooShortLength(durationMs: number): string {
  const seconds = Math.floor(durationMs / 1000);
  if (seconds < 1) return 'That was under a second.';
  return `That was ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`;
}
