import { notebookPrompt } from '../prompts/notebook.ts';
import type { Model } from '../providers/model.ts';
import type { SavedJudgement } from '../schemas/judgement.ts';
import type { Metrics } from '../schemas/metrics.ts';
import { notebookSchema } from '../schemas/coaching.ts';
import { twice } from './twice.ts';

// Stage 5: Update notebook. A short private note about the person's speaking habits, rewritten after each answer
// and read by the Coach next time. Saved in pipeline_version.
export const notebookVersion = notebookPrompt.version;

export const notebookMaxChars = 600;

type Input = { previousNotes: string; judgement: SavedJudgement; metrics: Metrics; tip: string };

type Options = { onAttemptFailed?: (error: Error) => void };

// One try, plus one more if the model errors or writes more than the notebook can hold.
export function updateNotebook({ previousNotes, judgement, metrics, tip }: Input, model: Model, { onAttemptFailed }: Options = {}): Promise<string> {
  return twice(async () => {
    const { notes } = await model.generate({
      prompt: notebookPrompt,
      input: {
        notes: previousNotes,
        marks: {
          mainPoint: judgement.mainPoint.score,
          reasonOrExample: judgement.reasonOrExample.score,
          ending: judgement.ending.score,
          mainPointAtSeconds: judgement.mainPointAtSeconds,
        },
        measurements: notebookMeasurements(metrics),
        tipGiven: tip,
      },
      schema: notebookSchema,
    });
    const text = notes.trim();
    if (text === '') throw new Error('notebook reply is empty');
    if (text.length > notebookMaxChars) throw new Error(`notebook reply is ${text.length} characters, more than ${notebookMaxChars}`);
    return text;
  }, onAttemptFailed);
}

// Only what the feedback can talk about. Measures that are stored but not shown yet (vague words, "and") stay out, so
// they can't reach the notes and, through them, the coach's tips.
function notebookMeasurements({ wordCount, fillers, pace, pauses, repeats, hedges }: Metrics) {
  return {
    wordCount,
    fillers: { total: fillers.total, byWord: fillers.byWord, perMinute: fillers.perMinute },
    pace,
    midSentencePauses: pauses.filter((p) => p.midSentence).length,
    repeats: repeats.count,
    hedges: { total: hedges.total, byPhrase: hedges.byPhrase },
  };
}
