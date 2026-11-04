import { z } from 'zod';

// Same shape as supabase/functions/_shared/schemas/coaching.ts. betterSteps and whatChanged come from coach prompt
// version 6; older answers don't have them.
export const coachingSchema = z.object({
  tip: z.string(),
  betterVersion: z.string(),
  betterSteps: z.array(z.object({ label: z.enum(['direction', 'point', 'support', 'off_track', 'ending']), text: z.string() })).optional(),
  whatChanged: z.string().optional(),
});

export type Coaching = z.infer<typeof coachingSchema>;
