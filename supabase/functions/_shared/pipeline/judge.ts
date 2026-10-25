import type { Model } from '../providers/model.ts';
import { judgePrompt } from '../prompts/judge.ts';
import { type Judgement, judgementSchema, type Mark } from '../schemas/judgement.ts';
import type { Transcript } from '../schemas/metrics.ts';
import { findQuoteStart, latePointSeconds, secondsIntoAnswer, transcriptText } from './transcriptText.ts';
import { twice } from './twice.ts';

// Stage 3: Judge. Claude marks the answer against the guide in prompts/judge.ts; plain code then checks
// every quote is real and counts when the main point came. Saved on every answer in pipeline_version.
export const judgeVersion = judgePrompt.version;

type Input = { question: string; transcript: Transcript; stoppedByTimeLimit: boolean };

export type JudgeResult = { judgement: Judgement; mainPointAtSeconds: number };

// The judge scores how clearly the point is stated; when it came is counted here. A late 2 (after latePointSeconds)
// becomes a 1.
export function applyPointTiming(mainPoint: Mark, atSeconds: number): Mark {
  return mainPoint.score === 2 && atSeconds > latePointSeconds ? { ...mainPoint, score: 1 } : mainPoint;
}

type Options = { onAttemptFailed?: (error: Error) => void };

// One try, plus one more if the model errors or quotes words that were never said.
export function judge(input: Input, model: Model, { onAttemptFailed }: Options = {}): Promise<JudgeResult> {
  return twice(() => judgeOnce(input, model), onAttemptFailed);
}

async function judgeOnce({ question, transcript, stoppedByTimeLimit }: Input, model: Model): Promise<JudgeResult> {
  const judgement = await model.generate({
    prompt: judgePrompt,
    input: { question, transcript: transcriptText(transcript), stoppedByTimeLimit },
    schema: judgementSchema,
  });

  for (const [name, mark] of Object.entries(judgement)) {
    for (const quote of mark.quotes) {
      if (findQuoteStart(transcript, quote) === null) throw new Error(`${name} quotes words that are not in the transcript: "${quote}"`);
    }
  }

  // The first quote is the sentence that states the main point (the guide asks for it first).
  const pointStart = findQuoteStart(transcript, judgement.mainPoint.quotes[0]) ?? 0;
  const mainPointAtSeconds = Math.round(secondsIntoAnswer(transcript, pointStart) * 10) / 10;
  return { judgement: { ...judgement, mainPoint: applyPointTiming(judgement.mainPoint, mainPointAtSeconds) }, mainPointAtSeconds };
}
