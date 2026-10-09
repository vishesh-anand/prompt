import { z } from 'npm:zod@4';

// What is saved on the answer row, and what the app reads. It has no length limit, so tips saved before the limit
// existed still load. The app has a copy in app/src/lib/schemas/coaching.ts.
export const coachingSchema = z.object({
  tip: z.string(),
  betterVersion: z.string(),
});

export type Coaching = z.infer<typeof coachingSchema>;

// A tip is about 25 words. The coach is told at most 25 (the prompt and the schema hint), but the model can't count
// words exactly, so the schema only refuses a tip over 35. That keeps an answer from failing over a few extra words, and
// still stops a paragraph. The model API can't enforce a word limit itself, so the limit is checked when the reply is
// parsed against this schema, and a reply over it is asked for again. (At a hard 30 and a prompt saying "never more than
// 30", half of the eval's runs failed, because the model aimed right at the limit.)
export const tipWordsTarget = 25;
export const maxTipWords = 35;

export const wordCount = (text: string) => text.split(/\s+/).filter((w) => w !== '').length;

// What the Coach is asked to produce: the same shape, with the tip limited.
export const coachingOutputSchema = z.object({
  tip: z
    .string()
    .describe(`One tip about the chosen focus, in the coach voice. At most ${tipWordsTarget} words.`)
    // The message names the real count, because the retry hands it back to the model.
    .refine((tip) => wordCount(tip) <= maxTipWords, { error: (issue) => `The tip is ${wordCount(String(issue.input))} words. It must be at most ${maxTipWords} words, so make it shorter.` }),
  betterVersion: z.string().describe("The person's own answer, clearer and tighter, with nothing added"),
});

// What the Notebook hands back: the whole updated note, not an addition to it.
export const notebookSchema = z.object({
  notes: z.string().describe('The updated notebook'),
});

export type Notebook = z.infer<typeof notebookSchema>;
