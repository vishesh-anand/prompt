import { z } from 'zod';

import { metricsSchema } from './metrics';

// The columns the app reads today. Judgement and coaching arrive with step 5.
export const answerSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  question_id: z.number(),
  audio_path: z.string(),
  duration_ms: z.number(),
  status: z.enum(['uploaded', 'transcribed', 'measured', 'judged', 'coached', 'failed']),
  metrics: metricsSchema.nullable(),
});

export type Answer = z.infer<typeof answerSchema>;
