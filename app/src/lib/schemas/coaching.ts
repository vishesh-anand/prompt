import { z } from 'zod';

// Same shape as supabase/functions/_shared/schemas/coaching.ts. betterSteps and whatChanged come from coach prompt
// version 6, reason (the sentence under the tip) from version 7, and moment (the person's own words the tip is about,
// in seconds from the first spoken word) from step D2. Older answers don't have them.
export const coachingSchema = z.object({
  tip: z.string(),
  betterVersion: z.string(),
  betterSteps: z.array(z.object({ label: z.enum(['direction', 'point', 'support', 'off_track', 'ending']), text: z.string() })).optional(),
  whatChanged: z.string().optional(),
  reason: z.string().optional(),
  moment: z.object({ quote: z.string(), atSeconds: z.number() }).optional(),
});

export type Coaching = z.infer<typeof coachingSchema>;
