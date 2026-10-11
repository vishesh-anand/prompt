import { weeklyNotePrompt } from '../prompts/weeklyNote.ts';
import type { Model } from '../providers/model.ts';
import { weeklyNoteSchema } from '../schemas/weeklyNote.ts';
import type { WeeklyFacts } from '../weeklyFacts.ts';
import { twice } from './twice.ts';

// The weekly note stage. Reads only the counted numbers and the notebook, never a transcript.
export const weeklyNoteVersion = weeklyNotePrompt.version;
export const weeklyNoteMaxChars = 400;

type Input = { facts: WeeklyFacts; notebook: string };
type Options = { onAttemptFailed?: (error: Error) => void };

// One try, plus one more if the model errors or writes more than the note can hold.
export function writeWeeklyNote({ facts, notebook }: Input, model: Model, { onAttemptFailed }: Options = {}): Promise<string> {
  return twice(async () => {
    const { text } = await model.generate({
      prompt: weeklyNotePrompt,
      input: { week: facts, notebook },
      schema: weeklyNoteSchema,
    });
    const note = text.trim();
    if (note === '') throw new Error('weekly note reply is empty');
    if (note.length > weeklyNoteMaxChars) throw new Error(`weekly note reply is ${note.length} characters, more than ${weeklyNoteMaxChars}`);
    return note;
  }, onAttemptFailed);
}
