import { z } from 'zod';

// What the weekly-note function replies. practiceDays is counted on the server, in your own timezone, so "2 of 3 days"
// is never counted a second way on the phone. note is null until the week has enough practice days.
export const weeklyNoteReplySchema = z.object({
  practiceDays: z.number(),
  daysNeeded: z.number(),
  note: z.string().nullable(),
  // A note is due but another request is writing it (or the week's attempts are used). Absent from older replies.
  writing: z.boolean().default(false),
  // The week's attempts are used up and nothing is tried again for a while.
  gaveUp: z.boolean().default(false),
});

export type WeeklyNoteReply = z.infer<typeof weeklyNoteReplySchema>;
