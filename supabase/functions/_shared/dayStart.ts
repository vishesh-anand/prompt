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

// A zone name we can use, or UTC. Same fallback as dayStartIn, so a day and a week never disagree about which zone they are in.
function usableZone(timeZone: string | null): string {
  if (timeZone) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone });
      return timeZone;
    } catch {
      // fall through to UTC
    }
  }
  return 'UTC';
}

// The calendar day an instant falls on in the person's zone, as "2026-10-10".
export function dayKeyIn(timeZone: string | null, instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: usableZone(timeZone), year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

// The moment the person's week began (Monday at midnight where they are) for the week that contains `instant`.
// Same week as the phone's Progress chart: Monday to Sunday.
export function weekStartIn(timeZone: string | null, instant: Date): Date {
  const dayStart = dayStartIn(timeZone, instant);
  // Noon is far from any midnight, so a clock change can't move it onto another day.
  const noon = new Date(dayStart.getTime() + 12 * 60 * 60_000);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: usableZone(timeZone), weekday: 'short' }).format(noon);
  const sinceMonday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday);
  const mondayNoon = new Date(noon.getTime() - sinceMonday * 24 * 60 * 60_000);
  return dayStartIn(timeZone, mondayNoon);
}
