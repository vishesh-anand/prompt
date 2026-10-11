import { weekStartIn } from '../_shared/dayStart.ts';
import { weeklyNoteVersion, writeWeeklyNote } from '../_shared/pipeline/weeklyNote.ts';
import type { Model } from '../_shared/providers/model.ts';
import { type AnswerRow, weeklyFacts } from '../_shared/weeklyFacts.ts';

// A practice week needs this many days before it gets a note (PRODUCT.md: "at least 3 practice days that week").
export const daysNeeded = 3;

// At most one attempt to write a note per person per week in this many seconds, and at most this many attempts in a week
// (a week has at most 5 notes, so the rest is room for failures).
export const claimSeconds = 60;
export const maxAttemptsPerWeek = 20;
// One model call may take this long, with no automatic retries. The stage tries twice, so both tries finish inside the
// claim: a second request can never start paying while the first is still running.
export const modelTimeoutMs = 20_000;

export type SavedNote = { text: string; days_covered: number };

// Everything the weekly note reads and writes. The real one is wired in index.ts; the tests use a fake.
export interface Store {
  profile(): Promise<{ timezone: string | null; baselineAnswerId: string | null }>;
  // The person's answers from this moment on, in any order.
  answersSince(from: Date): Promise<AnswerRow[]>;
  answer(id: string): Promise<AnswerRow | null>;
  notebook(): Promise<string>;
  savedNote(weekStart: string): Promise<SavedNote | null>;
  // Atomic: true for the one caller that may ask the model now. Anyone else, anyone within `minSeconds`, and anyone past
  // `maxAttempts` for the week, gets false.
  claim(weekStart: string, limits: { minSeconds: number; maxAttempts: number }): Promise<boolean>;
  // Saves only if it covers more days than what is saved, and returns what is saved afterwards.
  saveNote(note: { weekStart: string; text: string; daysCovered: number; promptVersion: number; model: string }): Promise<SavedNote>;
}

// `writing` is true when a note is due but another request holds the claim (or the week's attempts are used up), so the
// phone can say "not ready yet" and not "answers still being scored".
export type WeeklyNoteReply = { practiceDays: number; daysNeeded: number; note: string | null; writing: boolean };

// The Progress screen calls this every time it is shown. The model is only asked when the week has at least three
// practice days AND more of them than the saved note was written from, so a call with nothing new costs nothing.
export async function getWeeklyNote({ store, model, modelName, now }: { store: Store; model: Model; modelName: string; now: Date }): Promise<WeeklyNoteReply> {
  const { timezone, baselineAnswerId } = await store.profile();
  const from = weekStartIn(timezone, now);
  const answers = await store.answersSince(from);

  // First pass, with no starting point: it is enough to count the days, and often it is all we need.
  const counted = weeklyFacts({ timeZone: timezone, now, answers, start: null });
  const reply = (note: string | null, writing = false): WeeklyNoteReply => ({ practiceDays: counted.practiceDays, daysNeeded, note, writing });

  if (counted.practiceDays < daysNeeded) return reply(null);
  const saved = await store.savedNote(counted.weekStart);
  // Answers still being scored don't count yet: the note waits for three scored days, and is rewritten when another scores.
  if (counted.scoredDays < daysNeeded) return reply(saved?.text ?? null);
  if (saved && saved.days_covered >= counted.scoredDays) return reply(saved.text);

  // A note is due. Only one request may pay for it: the others (a second device, a retry, a loop) get the saved note back.
  if (!(await store.claim(counted.weekStart, { minSeconds: claimSeconds, maxAttempts: maxAttemptsPerWeek }))) {
    return reply(saved?.text ?? null, saved === null);
  }

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
