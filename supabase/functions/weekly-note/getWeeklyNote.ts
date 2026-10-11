import { weekStartIn } from '../_shared/dayStart.ts';
import { weeklyNoteVersion, writeWeeklyNote } from '../_shared/pipeline/weeklyNote.ts';
import type { Model } from '../_shared/providers/model.ts';
import { type AnswerRow, weeklyFacts } from '../_shared/weeklyFacts.ts';

// A practice week needs this many days before it gets a note (PRODUCT.md: "at least 3 practice days that week").
export const daysNeeded = 3;

// At most one attempt to write a note per person per week in this many seconds.
export const claimSeconds = 60;

export type SavedNote = { text: string; days_covered: number };

// Everything the weekly note reads and writes. The real one is wired in index.ts; the tests use a fake.
export interface Store {
  profile(): Promise<{ timezone: string | null; baselineAnswerId: string | null }>;
  // The person's answers from this moment on, oldest first.
  answersSince(from: Date): Promise<AnswerRow[]>;
  answer(id: string): Promise<AnswerRow | null>;
  notebook(): Promise<string>;
  savedNote(weekStart: string): Promise<SavedNote | null>;
  // Atomic: true for the one caller that may ask the model now. Anyone else, or anyone within `minSeconds`, gets false.
  claim(weekStart: string, minSeconds: number): Promise<boolean>;
  // Saves only if it covers more days than what is saved, and returns what is saved afterwards.
  saveNote(note: { weekStart: string; text: string; daysCovered: number; promptVersion: number; model: string }): Promise<SavedNote>;
}

export type WeeklyNoteReply = { practiceDays: number; daysNeeded: number; note: string | null };

// The Progress screen calls this every time it is shown. The model is only asked when the week has at least three
// practice days AND more of them than the saved note was written from, so a call with nothing new costs nothing.
export async function getWeeklyNote({ store, model, modelName, now }: { store: Store; model: Model; modelName: string; now: Date }): Promise<WeeklyNoteReply> {
  const { timezone, baselineAnswerId } = await store.profile();
  const from = weekStartIn(timezone, now);
  const answers = await store.answersSince(from);

  // First pass, with no starting point: it is enough to count the days, and often it is all we need.
  const counted = weeklyFacts({ timeZone: timezone, now, answers, start: null });
  const reply = (note: string | null): WeeklyNoteReply => ({ practiceDays: counted.practiceDays, daysNeeded, note });

  if (counted.practiceDays < daysNeeded) return reply(null);
  const saved = await store.savedNote(counted.weekStart);
  // Answers still being scored don't count yet: the note waits for three scored days, and is rewritten when another scores.
  if (counted.scoredDays < daysNeeded) return reply(saved?.text ?? null);
  if (saved && saved.days_covered >= counted.scoredDays) return reply(saved.text);

  // A note is due. Only one request may pay for it: the others (a second device, a retry, a loop) get the saved note back.
  if (!(await store.claim(counted.weekStart, claimSeconds))) return reply(saved?.text ?? null);

  // The note may have been written between the check above and winning the claim (a slow request that lost the race a
  // minute ago). Look again, so the same note is never paid for twice.
  const latest = await store.savedNote(counted.weekStart);
  if (latest && latest.days_covered >= counted.scoredDays) return reply(latest.text);

  const start = baselineAnswerId ? await store.answer(baselineAnswerId) : null;
  const facts = weeklyFacts({ timeZone: timezone, now, answers, start });
  const text = await writeWeeklyNote({ facts, notebook: await store.notebook() }, model);
  const stored = await store.saveNote({ weekStart: facts.weekStart, text, daysCovered: facts.scoredDays, promptVersion: weeklyNoteVersion, model: modelName });
  return reply(stored.text);
}
