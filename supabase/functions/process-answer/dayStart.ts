// How far ahead of UTC a timezone is at one moment (positive east of Greenwich), in milliseconds.
function offsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asIfUtc - Math.floor(at.getTime() / 1000) * 1000;
}

// The moment the person's day began (midnight where they are) for the day that contains `instant`.
// The daily limit counts from here, so "10 a day" means the person's own day. No timezone, or one we don't recognise, means UTC.
export function dayStartIn(timeZone: string | null, instant: Date): Date {
  if (timeZone) {
    try {
      const local = new Date(instant.getTime() + offsetMs(timeZone, instant));
      const midnightAsIfUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
      // The offset can differ between the guess and the real midnight when a clock change falls in between, so look again.
      let start = midnightAsIfUtc - offsetMs(timeZone, new Date(midnightAsIfUtc));
      start = midnightAsIfUtc - offsetMs(timeZone, new Date(start));
      // A zone that gives nonsense (NaN) falls back to UTC below instead of failing the whole request.
      if (Number.isFinite(start)) return new Date(start);
    } catch {
      // fall through to UTC
    }
  }
  const utc = new Date(instant);
  utc.setUTCHours(0, 0, 0, 0);
  return utc;
}
