import { weekStartIn } from '../_shared/dayStart.ts';
import { weeklyNoteVersion, writeWeeklyNote } from '../_shared/pipeline/weeklyNote.ts';
import type { Model } from '../_shared/providers/model.ts';
import { type AnswerRow, weeklyFacts } from '../_shared/weeklyFacts.ts';

// A practice week needs this many days before it gets a note (PRODUCT.md: "at least 3 practice days that week").
export const daysNeeded = 3;

// At most one attempt to write a note per person per week in this many seconds, and at most this many failed attempts in
// a row in a week (a saved note starts the count again, so a short outage can't use the week up).
export const claimSeconds = 180;
export const maxAttemptsPerWeek = 20;
// One model request may take this long, and the SDK does not retry on its own: it would sleep for as long as a busy
// server's retry-after asks, with no ceiling, and the stage already tries twice. The worst case is 2 tries x 20 s = 40 s,
// and the claim leaves minutes for the database reads and writes. This keeps a second request from paying while the
// first is still running; a test checks the sums.
// The deadline covers the whole call, body included (the SDK's own timeout stops at the reply's headers).
export const modelTimeoutMs = 20_000;
export const modelRetries = 0;
export const worstCaseModelMs = 2 * (modelRetries + 1) * modelTimeoutMs;

export type SavedNote = { text: string; days_covered: number };

// Everything the weekly note reads and writes. The real one is wired in index.ts; the tests use a fake.
export interface Store {
  profile(): Promise<{ timezone: string | null; baselineAnswerId: string | null }>;
  // The person's answers from this moment on, in any order.
  answersSince(from: Date): Promise<AnswerRow[]>;
  answer(id: string): Promise<AnswerRow | null>;
  notebook(): Promise<string>;
  savedNote(weekStart: string): Promise<SavedNote | null>;
  // Atomic: true for the one caller that may ask the model now. Anyone else, anyone within `minSeconds`, anyone past
  // `maxAttempts` for the week, and anyone when the saved note already covers `daysCovered`, gets false.
  claim(weekStart: string, limits: { minSeconds: number; maxAttempts: number; daysCovered: number }): Promise<boolean>;
  // The week's claim as it stands (read only after a claim is refused, to tell "someone is writing" from "gave up").
  claimState(weekStart: string): Promise<{ attempts: number; ageSeconds: number } | null>;
  // Saves only if it covers more days than what is saved, and returns what is saved afterwards.
  saveNote(note: { weekStart: string; text: string; daysCovered: number; promptVersion: number; model: string }): Promise<SavedNote>;
}

// `writing` is true when a note is due and another request holds the claim, so the phone can say "not ready yet" and not
// "answers still being scored". `gaveUp` is true when the week's attempts are used up and nothing more will be tried.
export type WeeklyNoteReply = { practiceDays: number; daysNeeded: number; note: string | null; writing: boolean; gaveUp: boolean };

// The Progress screen calls this every time it is shown. The model is only asked when the week has at least three
// practice days AND more of them than the saved note was written from, so a call with nothing new costs nothing.
export async function getWeeklyNote({ store, model, modelName, now }: { store: Store; model: Model; modelName: string; now: Date }): Promise<WeeklyNoteReply> {
  const { timezone, baselineAnswerId } = await store.profile();
  const from = weekStartIn(timezone, now);
  const answers = await store.answersSince(from);

  // First pass, with no starting point: it is enough to count the days, and often it is all we need.
  const counted = weeklyFacts({ timeZone: timezone, now, answers, start: null });
  const reply = (note: string | null, state: { writing?: boolean; gaveUp?: boolean } = {}): WeeklyNoteReply => ({
    practiceDays: counted.practiceDays,
    daysNeeded,
    note,
    writing: state.writing ?? false,
    gaveUp: state.gaveUp ?? false,
  });

  if (counted.practiceDays < daysNeeded) return reply(null);
  const saved = await store.savedNote(counted.weekStart);
  // Answers still being scored don't count yet: the note waits for three scored days, and is rewritten when another scores.
  if (counted.scoredDays < daysNeeded) return reply(saved?.text ?? null);
  if (saved && saved.days_covered >= counted.scoredDays) return reply(saved.text);

  // A note is due. Read what it is written from first: a database error here costs nothing, so it must not use up an attempt.
  const [start, notebook] = await Promise.all([baselineAnswerId ? store.answer(baselineAnswerId) : Promise.resolve(null), store.notebook()]);

  // Only one request may pay for the note: the others (a second device, a retry, a loop) get the saved note back.
  const limits = { minSeconds: claimSeconds, maxAttempts: maxAttemptsPerWeek, daysCovered: counted.scoredDays };
  if (!(await store.claim(counted.weekStart, limits))) {
    // The winner may have finished a moment ago, so look again. With still no note, either another request is writing
    // it, or the week's attempts are used up and nothing more will be tried.
    const current = await store.savedNote(counted.weekStart);
    if (current) return reply(current.text);
    // Used up AND past the cooldown: a request that is still running its last attempt is writing, not given up.
    const state = await store.claimState(counted.weekStart);
    const gaveUp = state !== null && state.attempts >= maxAttemptsPerWeek && state.ageSeconds >= claimSeconds;
    return reply(null, { writing: !gaveUp, gaveUp });
  }

  // Winning the claim already means no saved note covers these days: the database checks that in the same statement.
  const facts = weeklyFacts({ timeZone: timezone, now, answers, start });
  const text = await writeWeeklyNote({ facts, notebook }, model);
  const stored = await store.saveNote({ weekStart: facts.weekStart, text, daysCovered: facts.scoredDays, promptVersion: weeklyNoteVersion, model: modelName });
  return reply(stored.text);
}
