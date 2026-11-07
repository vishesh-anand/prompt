// A time on screen: 0:06, 0:40, 1:10. Rounded to the nearest second. Show it with tabular figures (DESIGN.md).
export function clock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
