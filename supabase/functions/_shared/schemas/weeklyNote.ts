import { z } from 'npm:zod@4';

// What the weekly note stage hands back: the note itself, in the coach voice.
export const weeklyNoteSchema = z.object({
  text: z.string().describe('The weekly note: at most 3 short sentences'),
});

export type WeeklyNote = z.infer<typeof weeklyNoteSchema>;
