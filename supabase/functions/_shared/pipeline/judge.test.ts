import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import type { Model } from '../providers/model.ts';
import type { Judgement } from '../schemas/judgement.ts';
import type { Transcript } from '../schemas/metrics.ts';
import { applyPointTiming, findQuoteStart, judge, latePointSeconds, secondsIntoAnswer, stoppedByTimeLimit } from './judge.ts';

// "Um, I like cats. Cats are calm." One word per second, starting 3 seconds in.
const words = ['Um,', 'I', 'like', 'cats.', 'Cats', 'are', 'calm.'];
const transcript: Transcript = {
  words: words.map((punctuated, i) => ({ text: punctuated.toLowerCase().replace(/[^a-z]/g, ''), punctuated, start: 3 + i, end: 3.8 + i })),
};
const input = { question: 'What do you like?', transcript, stoppedByTimeLimit: false };

const mark = (score: 0 | 1 | 2, quote: string) => ({ score, quotes: [quote], why: 'because' });
const good: Judgement = {
  mainPoint: mark(2, 'I like cats.'),
  reasonOrExample: mark(1, 'Cats are calm.'),
  ending: mark(1, 'Cats are calm.'),
};

// A model that answers with each reply in turn, and remembers how many times it was asked.
function modelThatSays(...replies: Judgement[]) {
  let calls = 0;
  const model: Model = {
    generate<T>() {
      return Promise.resolve(replies[Math.min(calls++, replies.length - 1)] as unknown as T);
    },
  };
  return { model, calls: () => calls };
}

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

Deno.test('a main point after 15 seconds drops a 2 to a 1; nothing else changes', () => {
  assertEquals(applyPointTiming(mark(2, 'x'), latePointSeconds).score, 2);
  assertEquals(applyPointTiming(mark(2, 'x'), latePointSeconds + 0.1).score, 1);
  assertEquals(applyPointTiming(mark(1, 'x'), 40).score, 1);
  assertEquals(applyPointTiming(mark(0, 'x'), 40).score, 0);
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

Deno.test('returns the judgement and when the main point came', async () => {
  const { model } = modelThatSays(good);
  const result = await judge(input, model);
  assertEquals(result.judgement, good);
  assertEquals(result.mainPointAtSeconds, 1); // "I like cats." starts 1 second after "Um,"
});

Deno.test('asks again once when a quote is made up, then accepts a real one', async () => {
  const made_up = { ...good, ending: mark(2, 'And that was the end.') };
  const { model, calls } = modelThatSays(made_up, good);
  const failures: string[] = [];
  const result = await judge(input, model, { onAttemptFailed: (e) => failures.push(e.message) });
  assertEquals(result.judgement, good);
  assertEquals(calls(), 2);
  assertEquals(failures.length, 1);
});

Deno.test('gives up after two bad answers', async () => {
  const made_up = { ...good, mainPoint: mark(2, 'I adore dogs.') };
  const { model, calls } = modelThatSays(made_up);
  await assertRejects(() => judge(input, model), Error, 'not in the transcript');
  assertEquals(calls(), 2);
});

Deno.test('a late main point is lowered to a 1 before it is returned', async () => {
  // "Um," at 0 s, then "I like cats." starts at 17 s.
  const slow: Transcript = { words: transcript.words.map((w, i) => ({ ...w, start: i === 0 ? 0 : 16 + i, end: 17 + i })) };
  const { model } = modelThatSays(good);
  const result = await judge({ ...input, transcript: slow }, model);
  assertEquals(result.mainPointAtSeconds, 17);
  assertEquals(result.judgement.mainPoint.score, 1);
});
