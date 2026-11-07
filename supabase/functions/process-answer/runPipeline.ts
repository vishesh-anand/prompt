import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@4';

import { coach, coachVersion } from '../_shared/pipeline/coach.ts';
import { judge, judgeVersion } from '../_shared/pipeline/judge.ts';
import { mapAnswer, mapVersion } from '../_shared/pipeline/map.ts';
import { measure, measureVersion } from '../_shared/pipeline/measure.ts';
import { notebookVersion, updateNotebook } from '../_shared/pipeline/notebook.ts';
import { chooseFocus, tipFocusVersion } from '../_shared/pipeline/tipFocus.ts';
import { transcribe } from '../_shared/pipeline/transcribe.ts';
import { stoppedByTimeLimit } from '../_shared/pipeline/transcriptText.ts';
import { twice } from '../_shared/pipeline/twice.ts';
import type { Usage } from '../_shared/providers/anthropic.ts';
import type { Model } from '../_shared/providers/model.ts';
import type { Transcriber } from '../_shared/providers/transcriber.ts';
import { coachingSchema } from '../_shared/schemas/coaching.ts';
import { savedJudgementSchema } from '../_shared/schemas/judgement.ts';
import { type SavedMap, savedMapSchema } from '../_shared/schemas/map.ts';
import { type Metrics, metricsSchema, type Transcript, transcriptSchema } from '../_shared/schemas/metrics.ts';
import { readNotebook, updateNotebookInOrder } from './notebookStore.ts';

export type AnswerRow = {
  id: string;
  user_id: string;
  question_id: number;
  audio_path: string;
  duration_ms: number;
  time_limit_ms: number;
  // When the answer was given, exactly as the database wrote it. The notebook uses it to stay in order.
  created_at: string;
  transcript: unknown;
  metrics: unknown;
  map: unknown;
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

const questionSchema = z.object({ text: z.string(), wants_direct_answer: z.boolean() });

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
    map: mapVersion,
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

  let freshCoaching: { tip: string; reason?: string } | null = null;
  let metrics: Metrics;
  let map: SavedMap;
  let transcript: Transcript;
  let notebookBefore = '';

  // The question, loaded once and only when a stage needs it.
  let question: z.infer<typeof questionSchema> | undefined;
  async function loadQuestion() {
    if (!question) {
      const { data, error } = await admin.from('questions').select('text, wants_direct_answer').eq('id', answer.question_id).single();
      if (error) throw error;
      question = questionSchema.parse(data);
    }
    return question;
  }

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

    // Nothing was said, so there is nothing to map, judge or coach.
    if (metrics.wordCount === 0) return;

    const timeLimit = stoppedByTimeLimit(answer.duration_ms, answer.time_limit_ms);

    // A saved map is kept as it is, whichever map prompt made it (map:old may have made it before this run).
    const savedMap = savedMapSchema.safeParse(answer.map);
    if (savedMap.success) {
      map = savedMap.data;
    } else {
      const { text } = await loadQuestion();
      map = await mapAnswer({ question: text, transcript, metrics, stoppedByTimeLimit: timeLimit }, modelFor('map'));
      await save({ map, status: 'mapped' });
    }

    // The judge's three marks still feed Progress, the weekly note and the before-and-after screen until step F.
    if (!savedJudgementSchema.safeParse(answer.judgement).success) {
      const { text } = await loadQuestion();
      const result = await judge({ question: text, transcript, stoppedByTimeLimit: timeLimit }, modelFor('judge'));
      const judgement = savedJudgementSchema.parse({ ...result.judgement, mainPointAtSeconds: result.mainPointAtSeconds });
      await save({ judgement, status: 'judged' });
    }

    if (!coachingSchema.safeParse(answer.coaching).success) {
      const { text, wants_direct_answer } = await loadQuestion();
      notebookBefore = (await readNotebook(admin, answer.user_id))?.notes ?? '';

      const focus = chooseFocus({ metrics, map, transcript, wantsDirectAnswer: wants_direct_answer, stoppedByTimeLimit: timeLimit });
      const coaching = await coach(
        { question: text, wantsDirectAnswer: wants_direct_answer, transcript, map, focus, notebook: notebookBefore, stoppedByTimeLimit: timeLimit },
        modelFor('coach'),
      );
      await save({ coaching, status: 'coached' });
      freshCoaching = coaching;
    }
  } catch (error) {
    console.error(`process-answer failed for ${answer.id}`, ...errorKind(error));
    // Best effort: if even this write fails, the app notices the row hasn't moved and offers a retry.
    await admin.from('answers').update({ status: 'failed' }).eq('id', answer.id);
    return;
  }

  // The notebook is best effort: the feedback is already saved, and a missed update is harmless. It is updated in
  // the order answers were given, and an answer older than the notebook never changes it (see notebookStore.ts).
  if (freshCoaching) {
    // The tip is only the next step from coach v7; the reason carries the specifics the notebook should keep.
    const tip = [freshCoaching.tip, freshCoaching.reason].filter(Boolean).join(' ');
    try {
      const outcome = await updateNotebookInOrder(admin, { userId: answer.user_id, answerAt: answer.created_at }, (previousNotes) =>
        updateNotebook({ previousNotes, map, metrics, tip }, modelFor('notebook')),
      );
      if (outcome === 'saved') {
        // The notebook's tokens are only known now, so they are added to the answer's saved cost.
        await save({});
      } else {
        console.log(`process-answer left the notebook alone for ${answer.id}: it has already moved past this answer`);
      }
    } catch (error) {
      console.error(`process-answer could not update the notebook for ${answer.id}`, ...errorKind(error));
    }
  }
}

// Only the kind of error and its status or code, never its message: a model error's message can echo what was sent,
// which is the person's own words. The same rule as the weekly note's log.
function errorKind(error: unknown): unknown[] {
  const e = error as { constructor?: { name?: string }; status?: unknown; code?: unknown } | null;
  return [e?.constructor?.name ?? 'unknown', e?.status ?? '', e?.code ?? ''];
}
