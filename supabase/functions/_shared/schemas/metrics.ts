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
  // From the first word's start to the last word's end, so silence at either end doesn't count.
  speakingSeconds: z.number(),
  fillers: z.object({
    total: z.number(),
    // Each filler that was said, with how many times: { um: 4, like: 3 }.
    byWord: z.record(z.string(), z.number()),
    perMinute: z.number().nullable(), // null when no time was spoken
    // Where each filler started, in the order said. Saved from measure version 5; older answers don't have it.
    atSeconds: z.array(z.number()).optional(),
  }),
  pace: z.object({
    wordsPerMinute: z.number().nullable(), // null when there are too few words to say
    band: paceBandSchema.nullable(),
  }),
  // Each long silence between two words: where it started, how long it was, and whether it fell inside a sentence.
  pauses: z.array(z.object({ atSeconds: z.number(), ms: z.number(), midSentence: z.boolean() })),
  // The same 1 to 3 words said twice in a row: "I think, I think".
  repeats: z.object({
    count: z.number(),
    atSeconds: z.array(z.number()),
  }),
  hedges: z.object({
    total: z.number(),
    byPhrase: z.record(z.string(), z.number()),
    atSeconds: z.array(z.number()),
  }),
  // Stored, not shown, until the listener check shows they matter (ARCHITECTURE.md, Evals).
  vagueWords: z.object({
    total: z.number(),
    byWord: z.record(z.string(), z.number()),
  }),
  ands: z.object({ count: z.number() }),
});

export type Metrics = z.infer<typeof metricsSchema>;
