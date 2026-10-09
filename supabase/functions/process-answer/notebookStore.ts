import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

// The coach's notebook only moves forward, in the order answers were given. It remembers the time of the newest
// answer it has absorbed (last_answer_at). Two rules keep it honest:
//  - an answer older than that never changes the notebook, and
//  - a write only succeeds if the notebook is exactly as it was when the new notes were written from it, so two
//    answers processed at once can't overwrite each other: the loser reads again and writes from the newer notes.

export type NotebookRow = { notes: string; last_answer_at: string | null };

// Postgres says "already exists" with this code.
const alreadyExists = '23505';

export async function readNotebook(admin: SupabaseClient, userId: string): Promise<NotebookRow | null> {
  const { data, error } = await admin.from('coach_notebooks').select('notes, last_answer_at').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

// Has the notebook already absorbed this answer, or a newer one? Compared as times, so the text format doesn't matter.
export function hasMovedPast(notebook: NotebookRow | null, answerAt: string): boolean {
  return notebook?.last_answer_at != null && Date.parse(notebook.last_answer_at) >= Date.parse(answerAt);
}

type Save = { userId: string; notes: string; answerAt: string; basedOn: NotebookRow | null };

// Writes notes that were made from `basedOn`. Returns false if the notebook changed in the meantime.
async function saveIfUnchanged({ userId, notes, answerAt, basedOn }: Save, admin: SupabaseClient): Promise<boolean> {
  const row = { notes, last_answer_at: answerAt, updated_at: new Date().toISOString() };
  if (basedOn === null) {
    // No notebook yet. If another answer created one first, the insert is refused.
    const { error } = await admin.from('coach_notebooks').insert({ user_id: userId, ...row });
    if (!error) return true;
    if (error.code === alreadyExists) return false;
    throw error;
  }
  const update = admin.from('coach_notebooks').update(row).eq('user_id', userId);
  const { data, error } = await (basedOn.last_answer_at === null ? update.is('last_answer_at', null) : update.eq('last_answer_at', basedOn.last_answer_at)).select('user_id');
  if (error) throw error;
  return data.length > 0;
}

// A few tries is plenty: each failed try means another answer's notebook update landed, and there are only ever a
// handful of answers in flight for one person.
const maxTries = 3;

// Folds this answer into the notebook, unless the notebook has already moved past it. `makeNotes` is given the
// current notes and returns the new ones (it is where the model is asked). Returns what happened.
export async function updateNotebookInOrder(
  admin: SupabaseClient,
  { userId, answerAt }: { userId: string; answerAt: string },
  makeNotes: (previousNotes: string) => Promise<string>,
): Promise<'saved' | 'skipped'> {
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const current = await readNotebook(admin, userId);
    if (hasMovedPast(current, answerAt)) return 'skipped';
    const notes = await makeNotes(current?.notes ?? '');
    if (await saveIfUnchanged({ userId, notes, answerAt, basedOn: current }, admin)) return 'saved';
  }
  throw new Error(`the notebook kept changing, so this answer was not added after ${maxTries} tries`);
}
