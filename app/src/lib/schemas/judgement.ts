import { z } from 'zod';

// Same shape as supabase/functions/_shared/schemas/judgement.ts (savedJudgementSchema). The scores come from
// Claude marking the answer; mainPointAtSeconds was counted by code.
const mark = z.object({
  score: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  quotes: z.array(z.string()),
  why: z.string(),
});

export const judgementSchema = z.object({
  mainPoint: mark,
  reasonOrExample: mark,
  ending: mark,
  mainPointAtSeconds: z.number(),
});

export type Judgement = z.infer<typeof judgementSchema>;
