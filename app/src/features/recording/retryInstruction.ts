import { z } from 'zod';

import { curly } from '@/lib/typography';

// Which answer's tip a retry carries. The try-again button names the answer it was pressed on (`tipFrom`), so a third try
// carries the second try's tip. Without it (an older link, or "Record again" after a take with no words) the first
// attempt's tip is used. Route params can arrive from a prompt:// link, so anything that isn't an id is ignored.
export function tipSource(params: { tipFrom?: string }, retryOf: string | null): string | null {
  if (retryOf === null) return null;
  return z.string().uuid().safeParse(params.tipFrom).data ?? retryOf;
}

// "This time: say your point in your first sentence." The tip is written as a sentence, so its first letter is lowered
// to follow "This time:", except for "I" and words that begin with two capitals (an acronym).
export function retryInstruction(tip: string | undefined): string | null {
  const text = tip?.trim();
  if (!text) return null;
  const [first = '', second = ''] = text;
  const keepsCapital = (first === 'I' && (second === '' || second === ' ' || second === "'" || second === '’')) || (second !== '' && second === second.toUpperCase() && second !== second.toLowerCase());
  const sentence = keepsCapital ? text : first.toLowerCase() + text.slice(1);
  return curly(`This time: ${sentence}`);
}
