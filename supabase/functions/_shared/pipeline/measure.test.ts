import { assertEquals } from 'jsr:@std/assert@1';

import type { Transcript } from '../schemas/metrics.ts';
import { fastAboveWpm, longPauseMs, measure, minWordsForPace, slowBelowWpm } from './measure.ts';

// Build a transcript from a sentence as it would be written. Every word lasts `wordSeconds` and
// the next starts straight after, unless a `gaps` entry (word index -> seconds) adds silence before it.
function say(sentence: string, { wordSeconds = 0.4, gaps = {} }: { wordSeconds?: number; gaps?: Record<number, number> } = {}): Transcript {
  let clock = 0;
  const words = sentence
    .split(/\s+/)
    .filter(Boolean)
    .map((token, i) => {
      clock += gaps[i] ?? 0;
      const start = clock;
      clock += wordSeconds;
      return { text: token.toLowerCase().replace(/[^a-z0-9']/g, ''), punctuated: token, start, end: clock };
    });
  return { words };
}

const fillers = (sentence: string) => measure({ transcript: say(sentence) }).fillers;

Deno.test('counts um and uh, including longer spellings', () => {
  assertEquals(fillers('Um I went, uh, there umm and uhh back'), { total: 4, byWord: { um: 2, uh: 2 } });
});

Deno.test('counts basically and actually', () => {
  assertEquals(fillers('It was basically fine and actually quick'), { total: 2, byWord: { basically: 1, actually: 1 } });
});

Deno.test('counts "like" as a filler but not as a verb or comparison', () => {
  assertEquals(fillers('It was like really big').byWord, { like: 1 });
  assertEquals(fillers('I like it').total, 0);
  assertEquals(fillers("I'd like to go").total, 0);
  assertEquals(fillers('It looks like rain').total, 0);
  assertEquals(fillers('We would like that').total, 0);
  assertEquals(fillers('It was, like, big').byWord, { like: 1 });
});

Deno.test('counts "you know" as a filler but not as a question', () => {
  assertEquals(fillers('It was, you know, fine').byWord, { 'you know': 1 });
  assertEquals(fillers('Do you know the way').total, 0);
  assertEquals(fillers('Tell me if you know it').total, 0);
  // A comma means it is not the question: "we all do, you know, without thinking".
  assertEquals(fillers('We all do, you know, without thinking').byWord, { 'you know': 1 });
});

Deno.test('counts "so" only at the start of a sentence', () => {
  assertEquals(fillers('So I went home').byWord, { so: 1 });
  assertEquals(fillers('I was tired. So I slept').byWord, { so: 1 });
  assertEquals(fillers('Why? So we left').byWord, { so: 1 });
  assertEquals(fillers('I was so tired').total, 0);
  assertEquals(fillers('It was late, so I left').total, 0);
});

Deno.test('counts a mix and totals it', () => {
  assertEquals(fillers('So um basically it was like fine, you know. So yes'), {
    total: 6,
    byWord: { so: 2, um: 1, basically: 1, like: 1, 'you know': 1 },
  });
});

// 20 words, so words per minute is easy to steer with the length of each word.
const twenty = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty';

Deno.test('pace bands: too slow, good, too fast, with the edges counted as good', () => {
  const wpm = (seconds: number) => measure({ transcript: say(twenty, { wordSeconds: seconds / 20 }) }).pace;
  assertEquals(wpm(20).band, 'too_slow'); // 60 wpm
  assertEquals(wpm(8).band, 'good'); // 150 wpm
  assertEquals(wpm(6).band, 'too_fast'); // 200 wpm
  assertEquals(wpm(8).wordsPerMinute, 150);
});

Deno.test('pace bands sit exactly on the named limits', () => {
  // 20 words at the limit: seconds = 20 / wpm * 60.
  const at = (wpm: number) => measure({ transcript: say(twenty, { wordSeconds: ((20 / wpm) * 60) / 20 }) }).pace.band;
  assertEquals(at(slowBelowWpm), 'good');
  assertEquals(at(slowBelowWpm - 1), 'too_slow');
  assertEquals(at(fastAboveWpm), 'good');
  assertEquals(at(fastAboveWpm + 1), 'too_fast');
});

Deno.test('pace ignores um and uh, and silence before and after is not part of it', () => {
  const noisy = say('um ' + twenty + ' uh', { wordSeconds: 0.4 });
  const spoken = measure({ transcript: noisy });
  assertEquals(spoken.wordCount, 20);
  // 20 spoken words over (22 * 0.4)s from first to last word.
  assertEquals(spoken.pace.wordsPerMinute, Math.round((20 / 8.8) * 60));
});

Deno.test('numbers count as words toward speed', () => {
  const sentence = 'I sat at a desk for 10 hours a day and then went home';
  assertEquals(measure({ transcript: say(sentence) }).wordCount, 14);
});

Deno.test('too few words give no speed', () => {
  const few = say(twenty.split(' ').slice(0, minWordsForPace - 1).join(' '));
  assertEquals(measure({ transcript: few }).pace, { wordsPerMinute: null, band: null });
});

Deno.test('long pauses: only gaps of the named length or more', () => {
  const longEnough = longPauseMs / 1000;
  const result = measure({ transcript: say('one two three four five six', { gaps: { 2: longEnough, 4: longEnough - 0.1 } }) });
  assertEquals(result.pauses.count, 1);
  assertEquals(result.pauses.longestMs, longPauseMs);
  assertEquals(result.pauses.atSeconds, [0.8]); // the second word ends at 0.8s
});

Deno.test('restarts: a repeated phrase is one restart, ignoring punctuation and fillers', () => {
  assertEquals(measure({ transcript: say('I think, I think we should go') }).restarts, { count: 1, atSeconds: [0.8] });
  assertEquals(measure({ transcript: say('I think um I think we should go') }).restarts.count, 1);
  assertEquals(measure({ transcript: say('We went to the, the shop') }).restarts.count, 1);
  assertEquals(measure({ transcript: say('I think I think I think so') }).restarts.count, 2);
  assertEquals(measure({ transcript: say('We went to the shop and then home') }).restarts.count, 0);
});

Deno.test('an empty transcript measures as nothing', () => {
  assertEquals(measure({ transcript: { words: [] } }), {
    wordCount: 0,
    fillers: { total: 0, byWord: {} },
    pace: { wordsPerMinute: null, band: null },
    pauses: { count: 0, longestMs: 0, atSeconds: [] },
    restarts: { count: 0, atSeconds: [] },
  });
});
