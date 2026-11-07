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
  // From coach prompt version 7: the tip is only the next step, and this is the one sentence saying what happened.
  reason: z.string().optional(),
  moment: z.object({ quote: z.string(), atSeconds: z.number() }).optional(),
});

export type Coaching = z.infer<typeof coachingSchema>;

// From coach prompt version 7 the tip is only the next step, shown large on the feedback screen (about 12 words), and
// the reason is the sentence saying what happened (about 25). Each is told a target, and the schema only refuses a reply
// well over it. That keeps an answer from failing over a few extra words, and still stops a paragraph. The model API
// can't enforce a word limit itself, so the limit is checked when the reply is parsed against this schema, and a reply
// over it is asked for again. (At a hard 30 and a prompt saying "never more than 30", half of the eval's runs failed,
// because the model aimed right at the limit.) "What changed" sits on one line above the shorter version.
export const tipWordsTarget = 12;
export const maxTipWords = 18;
export const reasonWordsTarget = 25;
export const maxReasonWords = 35;
export const whatChangedWordsTarget = 15;
export const maxWhatChangedWords = 22;

// The message names the real count, because the retry hands it back to the model.
const atMost = (max: number) => (text: string) => wordCount(text) <= max;
const overBy = (what: string, max: number) => (issue: { input: unknown }) =>
  `The ${what} is ${wordCount(String(issue.input))} words. It must be at most ${max} words, so make it shorter.`;

export const wordCount = (text: string) => text.split(/\s+/).filter((w) => w !== '').length;

// What the Coach is asked to produce: the tip (limited), the better version one sentence at a time with a label each, and
// one line saying what changed. Plain code joins the sentences into what is saved.
export const coachingOutputSchema = z.object({
  tip: z
    .string()
    .describe(`The one thing to do on the next try, as one short instruction to "you". At most ${tipWordsTarget} words.`)
    .refine(atMost(maxTipWords), { error: overBy('tip', maxTipWords) }),
  reason: z
    .string()
    .describe(`One sentence to "you" saying what happened in this answer, with the real time or moment. At most ${reasonWordsTarget} words.`)
    .refine(atMost(maxReasonWords), { error: overBy('reason', maxReasonWords) }),
  betterSentences: z
    .array(z.object({ text: z.string(), label: z.enum(stepLabels) }))
    .min(1)
    .describe("The person's own answer, clearer and tighter, with nothing added: one sentence at a time, each with its label"),
  whatChanged: z
    .string()
    .describe(`One short sentence saying what the better version changed, to "you". At most ${whatChangedWordsTarget} words.`)
    .refine(atMost(maxWhatChangedWords), { error: overBy('whatChanged', maxWhatChangedWords) }),
});

export type CoachingOutput = z.infer<typeof coachingOutputSchema>;

// What the Notebook hands back: the whole updated note, not an addition to it.
export const notebookSchema = z.object({
  notes: z.string().describe('The updated notebook'),
});

export type Notebook = z.infer<typeof notebookSchema>;
