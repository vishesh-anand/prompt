import { plainWord } from '../providers/transcriber.ts';
import type { Transcript } from '../schemas/metrics.ts';

// Plain-code helpers every AI stage shares: the answer as text, where a quoted moment is, and whether the timer
// stopped the answer.

// Did the time limit stop this answer? Each answer stores the limit it was recorded with (time_limit_ms: 2 minutes on a
// first try, 90 seconds on a retry, 60 seconds before step B). A little slack for the recorder's last few ms.
// Same rule as stoppedByTimeLimit in app/src/features/recording/limits.ts.
export function stoppedByTimeLimit(durationMs: number, timeLimitMs: number): boolean {
  return durationMs >= timeLimitMs - 500;
}

// A point that starts later than this (counted from the first spoken word) came late.
export const latePointSeconds = 15;

export function transcriptText(transcript: Transcript): string {
  return transcript.words.map((w) => w.punctuated).join(' ');
}

// Where a quote starts in the recording, in seconds, or null if those words aren't in the transcript in
// that order. Case and punctuation don't matter, filler words do. With `after`, only a match starting later counts,
// for words said more than once.
export function findQuoteStart(transcript: Transcript, quote: string, after = -Infinity): number | null {
  const spoken = transcript.words.map((w) => ({ plain: plainWord(w.punctuated), start: w.start })).filter((w) => w.plain !== '');
  const wanted = quote.split(/\s+/).map(plainWord).filter((w) => w !== '');
  if (wanted.length === 0) return null;
  for (let i = 0; i + wanted.length <= spoken.length; i++) {
    if (spoken[i].start > after && wanted.every((word, j) => spoken[i + j].plain === word)) return spoken[i].start;
  }
  return null;
}

// Counted from the first spoken word, so a slow start (silence before you begin) doesn't count against you.
export function secondsIntoAnswer(transcript: Transcript, quoteStart: number): number {
  return quoteStart - (transcript.words[0]?.start ?? 0);
}
