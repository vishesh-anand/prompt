import { z } from 'zod';

// The columns the app reads from profiles. reminder_time is a Postgres `time` ("20:00:00"), or null before first-time setup.
export const profileSchema = z.object({
  reminder_time: z.string().nullable(),
  timezone: z.string().nullable(),
});

export type Profile = z.infer<typeof profileSchema>;
