import { z } from 'zod';

export const questionSchema = z.object({
  id: z.number(),
  category: z.enum(['work', 'everyday']),
  text: z.string(),
});

export type Question = z.infer<typeof questionSchema>;
