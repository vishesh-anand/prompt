import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { z } from 'zod';

// The "never lose a recording" queue. A take lives here, on the phone, until its upload is confirmed.
// Each pending answer is two files in Documents/pending (not the cache, which iOS may clear):
// <answerId>.m4a is the audio, <answerId>.json says who it belongs to and which question it answered.

const pendingSchema = z.object({
  answerId: z.string(),
  userId: z.string(),
  questionId: z.number(),
  durationMs: z.number(),
});

export type PendingAnswer = z.infer<typeof pendingSchema> & { audio: File };

const folder = new Directory(Paths.document, 'pending');

function audioFile(answerId: string) {
  return new File(folder, `${answerId}.m4a`);
}

function detailsFile(answerId: string) {
  return new File(folder, `${answerId}.json`);
}

type Keep = { uri: string; durationMs: number; userId: string; questionId: number };

// Move the take somewhere safe, then write the details. The details come last, so a half-finished
// save is never mistaken for a complete one: the audio file just sits there until the next save.
export function keepAnswer({ uri, durationMs, userId, questionId }: Keep): PendingAnswer {
  folder.create({ intermediates: true, idempotent: true });
  const answerId = randomUUID();
  const audio = audioFile(answerId);
  new File(uri).move(audio);
  detailsFile(answerId).write(JSON.stringify({ answerId, userId, questionId, durationMs }));
  return { answerId, userId, questionId, durationMs, audio };
}

// Only the signed-in person's answers, so signing out and in as someone else never uploads into the wrong folder.
export function listPendingAnswers(userId: string): PendingAnswer[] {
  if (!folder.exists) return [];
  const found: PendingAnswer[] = [];
  for (const entry of folder.list()) {
    if (!(entry instanceof File) || !entry.name.endsWith('.json')) continue;
    try {
      const details = pendingSchema.parse(JSON.parse(entry.textSync()));
      const audio = audioFile(details.answerId);
      if (details.userId === userId && audio.exists) found.push({ ...details, audio });
    } catch {
      // Unreadable details: leave the files alone rather than delete a recording.
    }
  }
  return found;
}

export function removePendingAnswer(answerId: string) {
  const audio = audioFile(answerId);
  const details = detailsFile(answerId);
  if (details.exists) details.delete();
  if (audio.exists) audio.delete();
}
