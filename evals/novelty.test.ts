import { assertEquals } from 'jsr:@std/assert@1';

import type { Transcript } from '../supabase/functions/_shared/schemas/metrics.ts';
import { newWords } from './novelty.ts';

const said = 'Um, I like cats. We went to Lisbon with two cats, and, uh, it was fun.'.split(' ');
const transcript: Transcript = { words: said.map((punctuated, i) => ({ text: punctuated.toLowerCase().replace(/[^a-z]/g, ''), punctuated, start: i, end: i + 0.5 })) };

Deno.test('a rewrite made only of words that were said has nothing new', () => {
  assertEquals(newWords(transcript, 'I like cats. We went to Lisbon with two cats, and it was fun.'), { words: [], numbers: [], names: [] });
});

Deno.test('everyday new words are listed but are not numbers or names', () => {
  assertEquals(newWords(transcript, 'I like cats. They are fun.'), { words: ['they', 'are'], numbers: [], names: [] });
});

Deno.test('a new number, in digits or words, is flagged', () => {
  assertEquals(newWords(transcript, 'We went to Lisbon with 3 cats').numbers, ['3']);
  assertEquals(newWords(transcript, 'We went to Lisbon with three cats').numbers, ['three']);
  assertEquals(newWords(transcript, 'We went to Lisbon with two cats').numbers, []);
});

Deno.test('a new name is flagged, but a new word that starts a sentence is not', () => {
  assertEquals(newWords(transcript, 'I like cats. Then we went to Lisbon with Maria').names, ['maria']);
  assertEquals(newWords(transcript, 'I like cats. Honestly we went to Lisbon').names, []);
});

Deno.test("I'd, I'm and I'll are not names", () => {
  assertEquals(newWords(transcript, "I like cats. Honestly I'd say I'm happy and I'll stay").names, []);
});
