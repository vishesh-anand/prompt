import { z } from 'npm:zod@4';

import { stepLabels } from './map.ts';

// The better version as steps, labelled like the answer's map: neighbouring sentences with the same label, joined.
export const betterStepSchema = z.object({ label: z.enum(stepLabels), text: z.string() });

// What is saved on the answer row, and what the app reads. It has no length limit, so tips saved before the limit
// existed still load. betterSteps and whatChanged come from coach prompt version 6; older answers don't have them.
// `moment` is the person's own words the tip is about, picked by plain code (tipFocus.ts, version 6), shown quoted under
// the tip; seconds from the first spoken word. Answers coached before step D2 don't have it.
// The app has a copy in app/src/lib/schemas/coaching.ts.
export const coachingSchema = z.object({
  tip: z.string(),
  betterVersion: z.string(),
  betterSteps: z.array(betterStepSchema).optional(),
  whatChanged: z.string().optional(),
  moment: z.object({ quote: z.string(), atSeconds: z.number() }).optional(),
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

// What the Coach is asked to produce: the tip (limited), the better version one sentence at a time with a label each, and
// one line saying what changed. Plain code joins the sentences into what is saved.
export const coachingOutputSchema = z.object({
  tip: z
    .string()
    .describe(`One tip about the chosen focus, in the coach voice. At most ${tipWordsTarget} words.`)
    // The message names the real count, because the retry hands it back to the model.
    .refine((tip) => wordCount(tip) <= maxTipWords, { error: (issue) => `The tip is ${wordCount(String(issue.input))} words. It must be at most ${maxTipWords} words, so make it shorter.` }),
  betterSentences: z
    .array(z.object({ text: z.string(), label: z.enum(stepLabels) }))
    .min(1)
    .describe("The person's own answer, clearer and tighter, with nothing added: one sentence at a time, each with its label"),
  whatChanged: z.string().describe('One short sentence saying what the better version changed, to "you"'),
});

export type CoachingOutput = z.infer<typeof coachingOutputSchema>;

// What the Notebook hands back: the whole updated note, not an addition to it.
export const notebookSchema = z.object({
  notes: z.string().describe('The updated notebook'),
});

export type Notebook = z.infer<typeof notebookSchema>;
