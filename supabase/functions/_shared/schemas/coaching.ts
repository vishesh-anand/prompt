import { z } from 'npm:zod@4';

// What the Coach hands back. The app has a copy in app/src/lib/schemas/coaching.ts.
export const coachingSchema = z.object({
  tip: z.string().describe('One tip about the chosen focus, in the coach voice'),
  betterVersion: z.string().describe("The person's own answer, clearer and tighter, with nothing added"),
});

export type Coaching = z.infer<typeof coachingSchema>;

// What the Notebook hands back: the whole updated note, not an addition to it.
export const notebookSchema = z.object({
  notes: z.string().describe('The updated notebook'),
});

export type Notebook = z.infer<typeof notebookSchema>;
