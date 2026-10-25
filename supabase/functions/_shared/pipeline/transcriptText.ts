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

// A word ending in a full stop, question mark or exclamation mark ends a sentence. Measure and the Map share this rule.
export const sentenceEnd = /[.?!]["')\]]*$/;

// Which words of the transcript a quote covers (the first and the last, as positions in transcript.words), or null if
// those words aren't in the transcript in that order. Case and punctuation don't matter, filler words do. Only matches
// starting at word `from` or later count, for words said more than once.
export function findQuote(transcript: Transcript, quote: string, from = 0): { first: number; last: number } | null {
  const spoken = transcript.words.map((w, index) => ({ plain: plainWord(w.punctuated), index })).filter((w) => w.plain !== '');
  const wanted = quote.split(/\s+/).map(plainWord).filter((w) => w !== '');
  if (wanted.length === 0) return null;
  for (let i = 0; i + wanted.length <= spoken.length; i++) {
    if (spoken[i].index >= from && wanted.every((word, j) => spoken[i + j].plain === word)) {
      return { first: spoken[i].index, last: spoken[i + wanted.length - 1].index };
    }
  }
  return null;
}

// Where a quote starts in the recording, in seconds, or null if those words aren't in the transcript in that order.
export function findQuoteStart(transcript: Transcript, quote: string): number | null {
  const found = findQuote(transcript, quote);
  return found === null ? null : transcript.words[found.first].start;
}

// Counted from the first spoken word, so a slow start (silence before you begin) doesn't count against you.
export function secondsIntoAnswer(transcript: Transcript, quoteStart: number): number {
  return quoteStart - (transcript.words[0]?.start ?? 0);
}
