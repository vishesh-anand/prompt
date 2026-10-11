import { z } from 'zod';

// The columns the app reads from profiles. reminder_time is a Postgres `time` ("20:00:00"), or null before first-time setup.
export const profileSchema = z.object({
  reminder_time: z.string().nullable(),
  timezone: z.string().nullable(),
  // The first recording, kept as your starting point. Null until you have answered (set by the database).
  baseline_answer_id: z.string().nullable(),
});

export type Profile = z.infer<typeof profileSchema>;
