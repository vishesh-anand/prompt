import { mapPrompt } from '../prompts/map.ts';
import type { Model } from '../providers/model.ts';
import { plainWord } from '../providers/transcriber.ts';
import { type MapOutput, mapOutputSchema, type SavedMap } from '../schemas/map.ts';
import type { Transcript } from '../schemas/metrics.ts';
import { longPauseMs } from './measure.ts';
import { findQuoteWord, secondsIntoAnswer } from './transcriptText.ts';
import { problemOf, twice } from './twice.ts';

// Stage 3 (from step D; step C runs it from the evals only): Map. Claude reads the answer once as a first-time listener
// and returns its steps, the point, what it didn't follow, restarts and what a listener would notice. Plain code checks
// every quote is real and works out all the times. It never counts anything: counts stay in Measure.
export const mapVersion = mapPrompt.version;

type Input = { question: string; transcript: Transcript; stoppedByTimeLimit: boolean };

type Options = { onAttemptFailed?: (error: Error) => void };

const round1 = (x: number) => Math.round(x * 10) / 10;

// The answer as text, with each long silence written where it fell: "I went [2.3 s pause] outside." Same length rule
// as the pauses Measure counts, so the model sees the pauses that were counted.
export function transcriptWithPauses(transcript: Transcript): string {
  return transcript.words
    .map((w, i) => {
      const gapMs = i === 0 ? 0 : Math.round((w.start - transcript.words[i - 1].end) * 1000);
      return gapMs >= longPauseMs ? `[${(gapMs / 1000).toFixed(1)} s pause] ${w.punctuated}` : w.punctuated;
    })
    .join(' ');
}

// The model is told never to quote a pause mark, but if it does the words around it are still real.
export function withoutPauseMarks(quote: string): string {
  return quote.replace(/\[[\d.]+ s pause\]/g, ' ');
}

const find = (transcript: Transcript, quote: string, from?: number) => findQuoteWord(transcript, withoutPauseMarks(quote), from);

// Where each step starts in the recording, searching on from the step before, so words said twice are placed in order.
// Null for a step whose first words aren't found after the step before.
function stepStarts(output: MapOutput, transcript: Transcript): (number | null)[] {
  let from = 0;
  return output.steps.map((step) => {
    const word = find(transcript, step.startsWith, from);
    if (word === null) return null;
    from = word + 1;
    return transcript.words[word].start;
  });
}

// Everything plain code can check about a reply. An empty list means every quote is real, the steps are in order and
// they cover the whole answer: the first step starts at the first word, so words before it can't fall outside every step.
export function mapProblems(output: MapOutput, transcript: Transcript): string[] {
  const problems: string[] = [];
  if (output.point.restatement.trim() === '') problems.push('the point restatement is empty');
  const firstWord = transcript.words.find((w) => plainWord(w.punctuated) !== '');
  const starts = stepStarts(output, transcript);
  if (starts[0] !== null && starts[0] !== firstWord?.start) {
    problems.push(`step 1 starts with "${output.steps[0].startsWith}", but it must start at the first word, "${firstWord?.punctuated}"`);
  }
  starts.forEach((start, i) => {
    if (start === null) problems.push(`step ${i + 1} starts with "${output.steps[i].startsWith}", which is not in the transcript after step ${i}`);
  });
  const quotes = [
    output.point.quote,
    ...output.didntFollow.map((d) => d.quote),
    ...output.restarts.map((r) => r.quote),
    ...output.noticed.map((n) => n.quote),
  ].filter((q) => q.trim() !== '');
  for (const quote of quotes) {
    if (find(transcript, quote) === null) problems.push(`"${quote}" is not in the transcript`);
  }
  return problems;
}

// The times plain code adds to a reply that mapProblems passed.
export function placeSteps(output: MapOutput, transcript: Transcript): Omit<SavedMap, 'version'> {
  const words = transcript.words;
  const firstStart = words[0].start;
  const lastEnd = words[words.length - 1].end;

  const starts = stepStarts(output, transcript).map((start, i) => {
    if (start === null) throw new Error(`step ${i + 1} could not be placed`);
    return start;
  });

  const spoken = lastEnd - firstStart;
  const offTrack = output.steps.reduce((sum, step, i) => (step.label === 'off_track' ? sum + ((starts[i + 1] ?? lastEnd) - starts[i]) : sum), 0);
  const firstDirection = output.steps.findIndex((s) => s.label === 'direction' || s.label === 'point');

  return {
    ...output,
    steps: output.steps.map((step, i) => ({ ...step, atSeconds: round1(secondsIntoAnswer(transcript, starts[i])) })),
    pointAtSeconds: firstDirection === -1 ? null : round1(secondsIntoAnswer(transcript, starts[firstDirection])),
    offTrackShare: spoken > 0 ? Math.round((offTrack / spoken) * 100) / 100 : 0,
  };
}

// One try, plus one more if the model errors or quotes words that were never said. The second try is told why.
export function mapAnswer(input: Input, model: Model, { onAttemptFailed }: Options = {}): Promise<SavedMap> {
  if (input.transcript.words.length === 0) return Promise.reject(new Error('there are no words to map'));
  return twice(async (previousError) => {
    const output = await model.generate({
      prompt: mapPrompt,
      input: {
        question: input.question,
        transcript: transcriptWithPauses(input.transcript),
        stoppedByTimeLimit: input.stoppedByTimeLimit,
        ...(previousError ? { previousAttemptProblem: problemOf(previousError) } : {}),
      },
      schema: mapOutputSchema,
    });
    const problems = mapProblems(output, input.transcript);
    if (problems.length > 0) throw new Error(`map reply rejected: ${problems.join('; ')}`);
    return { ...placeSteps(output, input.transcript), version: mapVersion };
  }, onAttemptFailed);
}
