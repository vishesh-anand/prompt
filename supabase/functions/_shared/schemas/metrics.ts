import { z } from 'npm:zod@4';

// What the Transcriber hands back. Times are in seconds from the start of the recording.
export const transcriptSchema = z.object({
  words: z.array(
    z.object({
      text: z.string(), // as spoken, no punctuation: "so"
      punctuated: z.string(), // as written, with punctuation: "So,"
      start: z.number(),
      end: z.number(),
    }),
  ),
});

export type Transcript = z.infer<typeof transcriptSchema>;

export const paceBandSchema = z.enum(['too_slow', 'good', 'too_fast']);

// What Measure hands back. Everything here is counted by plain code. The app has a copy of this
// shape in app/src/lib/schemas/metrics.ts.
export const metricsSchema = z.object({
  wordCount: z.number(),
  fillers: z.object({
    total: z.number(),
    // Each filler that was said, with how many times: { um: 4, like: 3 }.
    byWord: z.record(z.string(), z.number()),
  }),
  pace: z.object({
    wordsPerMinute: z.number().nullable(), // null when there are too few words to say
    band: paceBandSchema.nullable(),
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
