import { z } from 'zod';

// Same shape as supabase/functions/_shared/schemas/coaching.ts.
export const coachingSchema = z.object({
  tip: z.string(),
  betterVersion: z.string(),
});

export type Coaching = z.infer<typeof coachingSchema>;
