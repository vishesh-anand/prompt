import { z } from 'zod';

// The details file kept next to a recording on the phone. Kept free of file-system code so it can be tested alone.
// retryOf defaults to null so files saved before retries existed still read as first attempts.
const pendingSchema = z.object({
  answerId: z.string(),
  userId: z.string(),
  questionId: z.number(),
  durationMs: z.number(),
  retryOf: z.string().nullable().default(null),
});

export type PendingDetails = z.infer<typeof pendingSchema>;

export function parsePending(text: string): PendingDetails {
  return pendingSchema.parse(JSON.parse(text));
}

export function serializePending(details: PendingDetails): string {
  return JSON.stringify(details);
}
