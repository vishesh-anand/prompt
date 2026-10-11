import { z } from 'zod';

import { judgementSchema } from './judgement';
import { metricsSchema } from './metrics';

// What Progress reads for each answer: when, how long, whether it is a retry, and the saved measurements and marks.
export const weekAnswerSchema = z.object({
  id: z.string(),
  retry_of: z.string().nullable(),
  created_at: z.string(),
  duration_ms: z.number(),
  metrics: metricsSchema.nullable(),
  judgement: judgementSchema.nullable(),
});

export type WeekAnswer = z.infer<typeof weekAnswerSchema>;
