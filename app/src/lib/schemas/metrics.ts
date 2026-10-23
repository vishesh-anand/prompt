import { z } from 'zod';

// Same shape as supabase/functions/_shared/schemas/metrics.ts. Every number here was counted by code.
export const metricsSchema = z.object({
  wordCount: z.number(),
  speakingSeconds: z.number(),
  fillers: z.object({
    total: z.number(),
    byWord: z.record(z.string(), z.number()),
    perMinute: z.number().nullable(),
  }),
  pace: z.object({
    wordsPerMinute: z.number().nullable(),
    band: z.enum(['too_slow', 'good', 'too_fast']).nullable(),
  }),
  pauses: z.array(z.object({ atSeconds: z.number(), ms: z.number(), midSentence: z.boolean() })),
  repeats: z.object({
    count: z.number(),
    atSeconds: z.array(z.number()),
  }),
  hedges: z.object({
    total: z.number(),
    byPhrase: z.record(z.string(), z.number()),
    atSeconds: z.array(z.number()),
  }),
  vagueWords: z.object({
    total: z.number(),
    byWord: z.record(z.string(), z.number()),
  }),
  ands: z.object({ count: z.number() }),
});

export type Metrics = z.infer<typeof metricsSchema>;
