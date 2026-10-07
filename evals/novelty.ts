import { plainWord } from '../supabase/functions/_shared/providers/transcriber.ts';
import type { Transcript } from '../supabase/functions/_shared/schemas/metrics.ts';

// Plain-code half of the "better version adds nothing" check: which words in the rewrite were never in the answer.
// Everyday new words ("they", "because") are expected when sentences are tightened, so `words` is for the owner to
// read. A new number or a new proper name is a likely invention, so those two are what fails a clip.
export type Novelty = { words: string[]; numbers: string[]; names: string[] };

const numberWords = new Set([
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'twenty', 'thirty', 'forty', 'fifty',
  'hundred', 'thousand', 'million', 'billion', 'half', 'double', 'triple', 'once', 'twice',
]);

export function newWords(original: Transcript, rewrite: string): Novelty {
  const said = new Set(original.words.map((w) => plainWord(w.punctuated)));
  const result: Novelty = { words: [], numbers: [], names: [] };
  const tokens = rewrite.split(/\s+/).filter((t) => t !== '');
  tokens.forEach((token, i) => {
    const plain = plainWord(token);
    if (plain === '' || said.has(plain)) return;
    if (!result.words.includes(plain)) result.words.push(plain);
    if ((/\d/.test(plain) || numberWords.has(plain)) && !result.numbers.includes(plain)) result.numbers.push(plain);
    // A capital letter that isn't the start of a sentence marks a name.
    const startsSentence = i === 0 || /[.!?]["')\]]*$/.test(tokens[i - 1]);
    const isContractionOfI = /^i'/.test(plain);
    if (!startsSentence && !isContractionOfI && /^["'(]*[A-Z]/.test(token) && !result.names.includes(plain)) result.names.push(plain);
  });
  return result;
}
