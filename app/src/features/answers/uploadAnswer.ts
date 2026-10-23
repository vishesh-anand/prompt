import { limitFor } from '@/features/recording/limits';
import { supabase } from '@/lib/supabase';

import { removePendingAnswer, type PendingAnswer } from './pendingAnswers';

// Postgres says "already exists" with this code.
const alreadyExists = '23505';

// Upload the audio, create the answer row, and only then delete the copy on the phone.
// Safe to run again after any failure: a file or row that is already there counts as done.
export async function uploadAnswer(pending: PendingAnswer): Promise<string> {
  const path = `${pending.userId}/${pending.answerId}.m4a`;

  const { error: uploadError } = await supabase.storage
    .from('recordings')
    .upload(path, await pending.audio.bytes(), { contentType: 'audio/mp4' });
  // Storage reports a repeat upload as a 409 "Duplicate".
  if (uploadError && !isDuplicate(uploadError)) throw uploadError;

  const { error: rowError } = await supabase
    .from('answers')
    .insert({
      id: pending.answerId,
      question_id: pending.questionId,
      duration_ms: pending.durationMs,
      retry_of: pending.retryOf,
      // Worked out from the kind of answer, so the take saved on the phone needs nothing new.
      time_limit_ms: limitFor(pending.retryOf),
    });
  if (rowError && rowError.code !== alreadyExists) throw rowError;

  removePendingAnswer(pending.answerId);
  return pending.answerId;
}

function isDuplicate(error: { message: string; statusCode?: string }): boolean {
  return error.statusCode === '409' || /already exists|duplicate/i.test(error.message);
}
