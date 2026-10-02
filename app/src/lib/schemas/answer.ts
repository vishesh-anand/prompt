import { z } from 'zod';

// The columns the app reads today. Transcript, metrics and the rest arrive with steps 4 and 5.
export const answerSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  question_id: z.number(),
  audio_path: z.string(),
  duration_ms: z.number(),
  status: z.enum(['uploaded', 'transcribed', 'measured', 'judged', 'coached', 'failed']),
});

export type Answer = z.infer<typeof answerSchema>;
