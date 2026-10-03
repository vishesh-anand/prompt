import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { measure, measureVersion } from '../_shared/pipeline/measure.ts';
import { transcribe } from '../_shared/pipeline/transcribe.ts';
import type { Transcriber } from '../_shared/providers/transcriber.ts';
import { metricsSchema, type Transcript, transcriptSchema } from '../_shared/schemas/metrics.ts';

export type AnswerRow = {
  id: string;
  audio_path: string;
  transcript: unknown;
  metrics: unknown;
};

type Versions = { transcriber: string; measure: number };

// Runs the stages in order, saving each result (and the status) before the next stage starts.
// It looks at which results are already saved, not at the status, so running it again after a
// crash or a failure picks up where it stopped. The recording is never touched.
export async function runPipeline(admin: SupabaseClient, answer: AnswerRow, transcriber: Transcriber, transcriberVersion: string) {
  const pipelineVersion: Versions = { transcriber: transcriberVersion, measure: measureVersion };

  async function save(changes: Record<string, unknown>) {
    const { error } = await admin.from('answers').update({ ...changes, pipeline_version: pipelineVersion }).eq('id', answer.id);
    if (error) throw error;
  }

  try {
    let transcript: Transcript;
    const saved = transcriptSchema.safeParse(answer.transcript);
    if (saved.success) {
      transcript = saved.data;
    } else {
      const { data, error } = await admin.storage.from('recordings').download(answer.audio_path);
      if (error) throw error;
      const audio = new Uint8Array(await data.arrayBuffer());
      transcript = await twice(() => transcribe({ audio }, transcriber));
      await save({ transcript, status: 'transcribed' });
    }

    if (!metricsSchema.safeParse(answer.metrics).success) {
      const metrics = metricsSchema.parse(measure({ transcript }));
      await save({ metrics, status: 'measured' });
    }
  } catch (error) {
    console.error(`process-answer failed for ${answer.id}`, error);
    // Best effort: if even this write fails, the app notices the row hasn't moved and offers a retry.
    await admin.from('answers').update({ status: 'failed' }).eq('id', answer.id);
  }
}

// Each stage gets one more try before the answer is marked failed.
async function twice<T>(stage: () => Promise<T>): Promise<T> {
  try {
    return await stage();
  } catch {
    return await stage();
  }
}
