import { z } from 'zod';

// One row per answer you have given: just enough to work out the streak and which questions you have seen.
export const historyRowSchema = z.object({
  id: z.string(),
  question_id: z.number(),
  retry_of: z.string().nullable(),
  created_at: z.string(),
});

export type HistoryRow = z.infer<typeof historyRowSchema>;
