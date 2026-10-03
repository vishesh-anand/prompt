import { z } from 'zod';

// Same shape as supabase/functions/_shared/schemas/metrics.ts. Every number here was counted by code.
export const metricsSchema = z.object({
  wordCount: z.number(),
  fillers: z.object({
    total: z.number(),
    byWord: z.record(z.string(), z.number()),
  }),
  pace: z.object({
    wordsPerMinute: z.number().nullable(),
    band: z.enum(['too_slow', 'good', 'too_fast']).nullable(),
  }),
  pauses: z.object({
    count: z.number(),
    longestMs: z.number(),
    atSeconds: z.array(z.number()),
  }),
  restarts: z.object({
    count: z.number(),
    atSeconds: z.array(z.number()),
  }),
});

export type Metrics = z.infer<typeof metricsSchema>;
