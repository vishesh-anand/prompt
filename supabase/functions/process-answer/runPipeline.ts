import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { coach, coachVersion } from '../_shared/pipeline/coach.ts';
import { judge, judgeVersion, stoppedByTimeLimit } from '../_shared/pipeline/judge.ts';
import { measure, measureVersion } from '../_shared/pipeline/measure.ts';
import { notebookVersion, updateNotebook } from '../_shared/pipeline/notebook.ts';
import { chooseFocus, tipFocusVersion } from '../_shared/pipeline/tipFocus.ts';
import { transcribe } from '../_shared/pipeline/transcribe.ts';
import { twice } from '../_shared/pipeline/twice.ts';
import type { Usage } from '../_shared/providers/anthropic.ts';
import type { Model } from '../_shared/providers/model.ts';
import type { Transcriber } from '../_shared/providers/transcriber.ts';
import { coachingSchema } from '../_shared/schemas/coaching.ts';
import { type SavedJudgement, savedJudgementSchema } from '../_shared/schemas/judgement.ts';
import { type Metrics, metricsSchema, type Transcript, transcriptSchema } from '../_shared/schemas/metrics.ts';

export type AnswerRow = {
  id: string;
  user_id: string;
  question_id: number;
  audio_path: string;
  duration_ms: number;
  transcript: unknown;
  metrics: unknown;
  judgement: unknown;
  coaching: unknown;
};

// What runPipeline needs from outside: the voice-to-text provider, and a way to get a model that reports the
// tokens it uses, so the cost of each stage ends up on the answer.
export type Providers = {
  transcriber: Transcriber;
  transcriberVersion: string;
  makeModel: (onUsage: (usage: Usage) => void) => Model;
  modelName: string;
};

type StageUsage = { inputTokens: number; outputTokens: number };

// Runs the stages in order, saving each result (and the status) before the next stage starts.
// It looks at which results are already saved, not at the status, so running it again after a
// crash or a failure picks up where it stopped. The recording is never touched.
export async function runPipeline(admin: SupabaseClient, answer: AnswerRow, providers: Providers) {
  const usage: Record<string, StageUsage> = {};
  const modelFor = (stage: string): Model =>
    providers.makeModel((u) => {
      const so = (usage[stage] ??= { inputTokens: 0, outputTokens: 0 });
      so.inputTokens += u.inputTokens;
      so.outputTokens += u.outputTokens;
    });

  // Which prompts, rules and models made this answer's feedback, and what the AI stages cost in tokens.
  const pipelineVersion = () => ({
    transcriber: providers.transcriberVersion,
    measure: measureVersion,
    judge: judgeVersion,
    tipFocus: tipFocusVersion,
    coach: coachVersion,
    notebook: notebookVersion,
    model: providers.modelName,
    usage: { ...usage },
  });

  async function save(changes: Record<string, unknown>) {
    const { error } = await admin.from('answers').update({ ...changes, pipeline_version: pipelineVersion() }).eq('id', answer.id);
    if (error) throw error;
  }

  let freshCoaching: { tip: string } | null = null;
  let metrics: Metrics;
  let judgement: SavedJudgement;
  let transcript: Transcript;
  let notebookBefore = '';

  try {
    const savedTranscript = transcriptSchema.safeParse(answer.transcript);
    if (savedTranscript.success) {
      transcript = savedTranscript.data;
    } else {
      const { data, error } = await admin.storage.from('recordings').download(answer.audio_path);
      if (error) throw error;
      const audio = new Uint8Array(await data.arrayBuffer());
      transcript = await twice(() => transcribe({ audio }, providers.transcriber));
      await save({ transcript, status: 'transcribed' });
    }

    const savedMetrics = metricsSchema.safeParse(answer.metrics);
    if (savedMetrics.success) {
      metrics = savedMetrics.data;
    } else {
      metrics = metricsSchema.parse(measure({ transcript }));
      await save({ metrics, status: 'measured' });
    }

    // Nothing was said, so there is nothing to judge or coach.
    if (metrics.wordCount === 0) return;

    const timeLimit = stoppedByTimeLimit(answer.duration_ms);

    const savedJudgement = savedJudgementSchema.safeParse(answer.judgement);
    if (savedJudgement.success) {
      judgement = savedJudgement.data;
    } else {
      const { data, error } = await admin.from('questions').select('text').eq('id', answer.question_id).single();
      if (error) throw error;
      const result = await judge({ question: data.text, transcript, stoppedByTimeLimit: timeLimit }, modelFor('judge'));
      judgement = savedJudgementSchema.parse({ ...result.judgement, mainPointAtSeconds: result.mainPointAtSeconds });
      await save({ judgement, status: 'judged' });
    }

    if (!coachingSchema.safeParse(answer.coaching).success) {
      const { data: question, error: questionError } = await admin.from('questions').select('text').eq('id', answer.question_id).single();
      if (questionError) throw questionError;
      const { data: notebookRow, error: notebookError } = await admin.from('coach_notebooks').select('notes').eq('user_id', answer.user_id).maybeSingle();
      if (notebookError) throw notebookError;
      notebookBefore = notebookRow?.notes ?? '';

      const focus = chooseFocus({ metrics, judgement, stoppedByTimeLimit: timeLimit });
      const coaching = await coach(
        { question: question.text, transcript, focus, notebook: notebookBefore, stoppedByTimeLimit: timeLimit },
        modelFor('coach'),
      );
      await save({ coaching, status: 'coached' });
      freshCoaching = coaching;
    }
  } catch (error) {
    console.error(`process-answer failed for ${answer.id}`, error);
    // Best effort: if even this write fails, the app notices the row hasn't moved and offers a retry.
    await admin.from('answers').update({ status: 'failed' }).eq('id', answer.id);
    return;
  }

  // The notebook is best effort: the feedback is already saved, and a missed update is harmless.
  if (freshCoaching) {
    try {
      const notes = await updateNotebook({ previousNotes: notebookBefore, judgement, metrics, tip: freshCoaching.tip }, modelFor('notebook'));
      const { error } = await admin.from('coach_notebooks').upsert({ user_id: answer.user_id, notes, updated_at: new Date().toISOString() });
      if (error) throw error;
      // The notebook's tokens are only known now, so they are added to the answer's saved cost.
      await save({});
    } catch (error) {
      console.error(`process-answer could not update the notebook for ${answer.id}`, error);
    }
  }
}
