import { assertEquals } from 'jsr:@std/assert@1';

import type { Transcript } from '../schemas/metrics.ts';
import { findQuoteStart, findQuoteWord, secondsIntoAnswer, stoppedByTimeLimit } from './transcriptText.ts';

// "Um, I like cats. Cats are calm." One word per second, starting 3 seconds in.
const words = ['Um,', 'I', 'like', 'cats.', 'Cats', 'are', 'calm.'];
const transcript: Transcript = {
  words: words.map((punctuated, i) => ({ text: punctuated.toLowerCase().replace(/[^a-z]/g, ''), punctuated, start: 3 + i, end: 3.8 + i })),
};

Deno.test('finds where a quote starts, ignoring case and punctuation', () => {
  assertEquals(findQuoteStart(transcript, 'i LIKE cats'), 4);
  assertEquals(findQuoteStart(transcript, 'Um, I like'), 3);
  assertEquals(findQuoteStart(transcript, 'cats are calm.'), 7);
});

Deno.test('a quote that was never said, or said in a different order, is not found', () => {
  assertEquals(findQuoteStart(transcript, 'I love cats'), null);
  assertEquals(findQuoteStart(transcript, 'calm cats'), null);
  assertEquals(findQuoteStart(transcript, '...'), null);
});

Deno.test('time is counted from the first spoken word, not from the start of the recording', () => {
  assertEquals(secondsIntoAnswer(transcript, 7), 4);
});

Deno.test('the time limit counts the last half second of recorder slack', () => {
  assertEquals(stoppedByTimeLimit(120_029, 120_000), true);
  assertEquals(stoppedByTimeLimit(119_600, 120_000), true);
  assertEquals(stoppedByTimeLimit(117_924, 120_000), false);
  assertEquals(stoppedByTimeLimit(89_600, 90_000), true);
});

Deno.test('the time limit is the one the answer was recorded with', () => {
  // Before step B every answer stopped at 60 seconds; under the 2-minute limit, 60 seconds is a choice.
  assertEquals(stoppedByTimeLimit(60_000, 60_000), true);
  assertEquals(stoppedByTimeLimit(60_000, 120_000), false);
  assertEquals(stoppedByTimeLimit(60_000, 90_000), false);
});

Deno.test('with a word to search from, only a match there or later counts', () => {
  assertEquals(findQuoteWord(transcript, 'cats'), 3);
  assertEquals(findQuoteWord(transcript, 'cats', 4), 4);
  assertEquals(findQuoteWord(transcript, 'cats', 5), null);
});

Deno.test('a later word with the same start time as an earlier one can still be found', () => {
  // A cut where the transcriber gave two words the same start.
  const sameStart: Transcript = { words: ['so', 'so', 'yes.'].map((punctuated) => ({ text: punctuated, punctuated, start: 1, end: 1 })) };
  assertEquals(findQuoteWord(sameStart, 'so', 1), 1);
});
