import { assertAlmostEquals, assertEquals } from 'jsr:@std/assert@1';

import { measure } from '../supabase/functions/_shared/pipeline/measure.ts';
import type { Transcript } from '../supabase/functions/_shared/schemas/metrics.ts';
import { levelsOff, rawHesitations, scoreFillers, scoreHesitations, wordErrorRate } from './score.ts';

// A transcript from plain text, one word per half second.
function say(text: string): Transcript {
  return {
    words: text.split(/\s+/).map((token, i) => ({
      text: token.toLowerCase().replace(/[^a-z0-9']/g, ''),
      punctuated: token,
      start: i * 0.5,
      end: i * 0.5 + 0.4,
    })),
  };
}

const metricsOf = (text: string) => measure({ transcript: say(text) });

Deno.test('hesitations: um and uh count as one group', () => {
  const metrics = metricsOf('Um I think uh we should, um, go');
  assertEquals(scoreHesitations(metrics, 4), { expected: 4, found: 3, caught: 3, missed: 1, extra: 0 });
  assertEquals(scoreHesitations(metrics, 2), { expected: 2, found: 3, caught: 2, missed: 0, extra: 1 });
});

Deno.test('hesitations: a provider that writes none scores zero caught', () => {
  assertEquals(scoreHesitations(metricsOf('I think we should go'), 3).caught, 0);
});

Deno.test('fillers: counts each ordinary word and leaves um and uh to the hesitation score', () => {
  const metrics = metricsOf('So um it was basically fine. So yes');
  const result = scoreFillers(metrics, { so: 2, basically: 1, like: 1 });
  assertEquals(result.byWord.so, { expected: 2, found: 2, caught: 2, missed: 0, extra: 0 });
  assertEquals(result.byWord.like, { expected: 1, found: 0, caught: 0, missed: 1, extra: 0 });
  assertEquals('um' in result.byWord, false);
  assertEquals(result.all, { expected: 4, found: 3, caught: 3, missed: 1, extra: 0 });
});

Deno.test('raw hesitations: lists every spelling a provider used, even ones Measure ignores', () => {
  assertEquals(rawHesitations(say('Um, so ah I think, erm, uh, ah')), { um: 1, ah: 2, erm: 1, uh: 1 });
  assertEquals(rawHesitations(say('I think so')), {});
});

Deno.test('word error rate: identical text is 0, ignoring case, punctuation and hesitations', () => {
  assertEquals(wordErrorRate('Um, I sat at a desk.', say('I sat at a desk')), 0);
});

Deno.test('word error rate: counts a swap, a missing word and an extra word', () => {
  assertAlmostEquals(wordErrorRate('I sat at a desk', say('I sat on a desk'))!, 1 / 5);
  assertAlmostEquals(wordErrorRate('I sat at a desk', say('I sat a desk'))!, 1 / 5);
  assertAlmostEquals(wordErrorRate('Do you know what', say('Do you know about what'))!, 1 / 4);
});

Deno.test('word error rate: "10" and "ten" are the same word', () => {
  assertEquals(wordErrorRate('I sat for ten hours, twenty one times', say('I sat for 10 hours 21 times')), 0);
});

Deno.test('word error rate: nothing to compare against gives null', () => {
  assertEquals(wordErrorRate(null, say('anything')), null);
  assertEquals(wordErrorRate('um uh', say('anything')), null);
});

Deno.test('a miss is described as off by one level or off by two levels, in either direction', () => {
  assertEquals(levelsOff(2, 2), 'exactly right');
  assertEquals(levelsOff(2, 1), 'off by one level');
  assertEquals(levelsOff(0, 1), 'off by one level');
  assertEquals(levelsOff(2, 0), 'off by two levels');
  assertEquals(levelsOff(0, 2), 'off by two levels');
});
