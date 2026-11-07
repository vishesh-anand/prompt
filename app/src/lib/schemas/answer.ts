import { z } from 'zod';

import { coachingSchema } from './coaching';
import { judgementSchema } from './judgement';
import { mapSchema } from './map';
import { metricsSchema } from './metrics';

// The columns the app reads today.
export const answerSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  question_id: z.number(),
  // The first attempt this answer retries, or null when this is the first attempt.
  retry_of: z.string().nullable(),
  audio_path: z.string(),
  duration_ms: z.number(),
  // The limit it was recorded with: 2 minutes on a first try, 90 seconds on a retry, 60 seconds before step B.
  time_limit_ms: z.number(),
  status: z.enum(['uploaded', 'transcribed', 'measured', 'mapped', 'judged', 'coached', 'failed']),
  metrics: metricsSchema.nullable(),
  // A map that doesn't load (an old or unexpected shape) is treated as no map, not as an error: an error here sends the
  // feedback screen home and makes compare say the answer is unavailable.
  map: mapSchema.nullable().catch(null),
  judgement: judgementSchema.nullable(),
  coaching: coachingSchema.nullable(),
  feedback_flagged: z.boolean(),
  // "That's what I meant" = true, "Not quite" = false, not tapped = null. The phone may write it on its own answers.
  listener_confirmed: z.boolean().nullable(),
});

export type Answer = z.infer<typeof answerSchema>;

// Just enough to restart an answer whose processing never finished.
export const unfinishedAnswerSchema = z.object({ id: z.string() });
