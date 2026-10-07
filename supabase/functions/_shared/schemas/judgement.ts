import { z } from 'npm:zod@4';

// One of the three marks. The score is 0, 1 or 2 as defined in prompts/judge.ts, and every score
// quotes the words that justify it. Plain code checks the quotes really appear in the transcript.
const mark = z.object({
  score: z.union([z.literal(0), z.literal(1), z.literal(2)]).describe('0, 1 or 2'),
  quotes: z.array(z.string()).min(1).describe('Exact words from the transcript that justify the score, at least one'),
  why: z.string().describe('One short sentence saying why'),
});

export const judgementSchema = z.object({
  mainPoint: mark,
  reasonOrExample: mark,
  ending: mark,
});

// What is saved on the answer row: the marks plus when the main point started (counted by code), so a
// restarted pipeline doesn't have to judge again to know it. The app has a copy in app/src/lib/schemas/judgement.ts.
export const savedJudgementSchema = judgementSchema.extend({ mainPointAtSeconds: z.number() });

export type Mark = z.infer<typeof mark>;
export type Judgement = z.infer<typeof judgementSchema>;
export type SavedJudgement = z.infer<typeof savedJudgementSchema>;
