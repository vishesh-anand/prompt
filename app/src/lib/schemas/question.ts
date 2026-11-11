import { z } from 'zod';

export const questionSchema = z.object({
  id: z.number(),
  category: z.enum(['work', 'everyday']),
  text: z.string(),
  // The question asks for an answer first, not a story (ARCHITECTURE.md, questions). The retry check reads it.
  wants_direct_answer: z.boolean(),
});

export type Question = z.infer<typeof questionSchema>;
