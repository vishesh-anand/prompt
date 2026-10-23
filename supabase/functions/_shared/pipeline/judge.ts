import type { Model } from '../providers/model.ts';
import { plainWord } from '../providers/transcriber.ts';
import { judgePrompt } from '../prompts/judge.ts';
import { type Judgement, judgementSchema, type Mark } from '../schemas/judgement.ts';
import type { Transcript } from '../schemas/metrics.ts';
import { twice } from './twice.ts';

// Stage 3: Judge. Claude marks the answer against the guide in prompts/judge.ts; plain code then checks
// every quote is real and counts when the main point came. Saved on every answer in pipeline_version.
export const judgeVersion = judgePrompt.version;

// Did the time limit stop this answer? Each answer stores the limit it was recorded with (time_limit_ms: 2 minutes on a
// first try, 90 seconds on a retry, 60 seconds before step B). A little slack for the recorder's last few ms.
// Same rule as stoppedByTimeLimit in app/src/features/recording/limits.ts.
export function stoppedByTimeLimit(durationMs: number, timeLimitMs: number): boolean {
  return durationMs >= timeLimitMs - 500;
}

// A main point that starts later than this (counted from the first spoken word) can't score a 2.
export const latePointSeconds = 15;

type Input = { question: string; transcript: Transcript; stoppedByTimeLimit: boolean };

export type JudgeResult = { judgement: Judgement; mainPointAtSeconds: number };

export function transcriptText(transcript: Transcript): string {
  return transcript.words.map((w) => w.punctuated).join(' ');
}

// Where a quote starts in the recording, in seconds, or null if those words aren't in the transcript in
// that order. Case and punctuation don't matter, filler words do.
export function findQuoteStart(transcript: Transcript, quote: string): number | null {
  const spoken = transcript.words.map((w) => ({ plain: plainWord(w.punctuated), start: w.start })).filter((w) => w.plain !== '');
  const wanted = quote.split(/\s+/).map(plainWord).filter((w) => w !== '');
  if (wanted.length === 0) return null;
  for (let i = 0; i + wanted.length <= spoken.length; i++) {
    if (wanted.every((word, j) => spoken[i + j].plain === word)) return spoken[i].start;
  }
  return null;
}

// Counted from the first spoken word, so a slow start (silence before you begin) doesn't count against you.
export function secondsIntoAnswer(transcript: Transcript, quoteStart: number): number {
  return quoteStart - (transcript.words[0]?.start ?? 0);
}

// The judge scores how clearly the point is stated; when it came is counted here. A late 2 becomes a 1.
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
