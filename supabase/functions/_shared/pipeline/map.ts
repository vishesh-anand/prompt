import { mapPrompt } from '../prompts/map.ts';
import type { Model } from '../providers/model.ts';
import { plainWord } from '../providers/transcriber.ts';
import { type MapOutput, mapOutputSchema, type SavedMap } from '../schemas/map.ts';
import type { Metrics, Transcript } from '../schemas/metrics.ts';
import { longPauseMs } from './measure.ts';
import { findQuote, secondsIntoAnswer, sentenceEnd } from './transcriptText.ts';
import { problemOf, twice } from './twice.ts';

// Stage 3 (from step D; step C runs it from the evals only): Map. Claude reads the answer once as a first-time listener
// and returns its steps, the point, what it didn't follow, restarts and what a listener would notice. Plain code checks
// every quote is real and works out all the times. It never counts anything: counts stay in Measure, and the model
// only picks which counted items a listener would notice.
export const mapVersion = mapPrompt.version;

type Input = { question: string; transcript: Transcript; metrics: Metrics; stoppedByTimeLimit: boolean };

type Options = { onAttemptFailed?: (error: Error) => void };

type Span = { first: number; last: number };

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

// What Measure counted, for the model to choose from. Repeats and pauses are given as how many; the text shows the pauses.
export function countedItems(metrics: Metrics) {
  return {
    fillers: metrics.fillers.byWord,
    hedges: metrics.hedges.byPhrase,
    repeats: metrics.repeats.count,
    midSentencePauses: metrics.pauses.filter((p) => p.midSentence).length,
  };
}

// The model is told never to quote a pause mark, but if it does the words around it are still real.
export function withoutPauseMarks(quote: string): string {
  return quote.replace(/\[[\d.]+ s pause\]/g, ' ');
}

const locate = (transcript: Transcript, quote: string, from?: number) => findQuote(transcript, withoutPauseMarks(quote), from);

// Where each step starts, as a word position, searching on from the step before. Null for a step not found there.
export function stepWords(output: MapOutput, transcript: Transcript): (number | null)[] {
  let from = 0;
  return output.steps.map((step) => {
    const found = locate(transcript, step.startsWith, from);
    if (found === null) return null;
    from = found.first + 1;
    return found.first;
  });
}

// Did Measure count a thing of this kind at the quoted moment? Fillers have no saved positions, so for them the quote
// must contain a filler word that was counted somewhere in the answer.
function wasCounted(kind: MapOutput['noticed'][number]['kind'], quote: string, { first, last }: Span, transcript: Transcript, metrics: Metrics): boolean {
  const said = ` ${withoutPauseMarks(quote).split(/\s+/).map(plainWord).filter((w) => w !== '').join(' ')} `;
  const inside = transcript.words.slice(first, last + 1);
  switch (kind) {
    case 'fillers':
      return Object.keys(metrics.fillers.byWord).some((filler) => said.includes(` ${filler} `));
    case 'hedge':
      return metrics.hedges.atSeconds.some((at) => inside.some((w) => round1(w.start) === at));
    // A counted mid-sentence pause falls between two of the quoted words.
    case 'pause':
      return metrics.pauses.some((p) => p.midSentence && inside.slice(0, -1).some((w) => round1(w.end) === p.atSeconds));
    case 'repeat':
      return metrics.repeats.atSeconds.some((at) => inside.some((w) => round1(w.start) === at));
    case 'pattern':
      return true;
  }
}

// Everything plain code can check about a reply. An empty list means it is fine to save.
export function mapProblems(output: MapOutput, transcript: Transcript, metrics: Metrics): string[] {
  const problems: string[] = [];
  const words = transcript.words;
  if (output.point.restatement.trim() === '') problems.push('the point restatement is empty');

  // Steps start at sentence starts, in order, with opening words that appear nowhere earlier, and the first step starts
  // at the first word, so every word belongs to a step.
  const starts = stepWords(output, transcript);
  const firstWord = words.findIndex((w) => plainWord(w.punctuated) !== '');
  output.steps.forEach((step, i) => {
    const at = starts[i];
    const name = `step ${i + 1} ("${step.startsWith}")`;
    if (at === null) {
      problems.push(`${name} is not in the transcript after step ${i}`);
      return;
    }
    if (i === 0 && at !== firstWord) problems.push(`${name} must start at the first word, "${words[firstWord].punctuated}"`);
    if (i > 0 && !sentenceEnd.test(words[at - 1].punctuated)) problems.push(`${name} must start at the start of a sentence`);
    if (locate(transcript, step.startsWith)?.first !== at) problems.push(`${name} also appears earlier in the answer; quote opening words that appear only once`);
  });

  // Exactly one point step when there is a point, none when there isn't, and the point quote is inside it.
  const pointSteps = output.steps.flatMap((s, i) => (s.label === 'point' ? [i] : []));
  const pointQuote = output.point.quote.trim();
  if (pointSteps.length > 1) problems.push(`${pointSteps.length} steps are point; exactly one step is point`);
  if (pointSteps.length === 0 && pointQuote !== '') problems.push('point.quote is given, but no step is point');
  if (pointSteps.length === 1 && pointQuote === '') problems.push('a step is point, but point.quote is empty');
  if (pointSteps.length === 1 && pointQuote !== '') {
    const from = starts[pointSteps[0]];
    const to = starts[pointSteps[0] + 1] ?? words.length;
    const found = from === null ? null : locate(transcript, pointQuote, from);
    if (from !== null && (found === null || found.last >= to)) problems.push(`point.quote "${pointQuote}" is not inside the point step`);
  }

  // Every other quote is real and said only once, so the moment it names is the right one.
  const quotes = [pointQuote, ...output.didntFollow.map((d) => d.quote), ...output.restarts.map((r) => r.quote), ...output.noticed.map((n) => n.quote)];
  for (const quote of quotes.filter((q) => q !== '')) {
    const found = locate(transcript, quote);
    if (found === null) problems.push(`"${quote}" is not in the transcript`);
    else if (locate(transcript, quote, found.first + 1) !== null) problems.push(`"${quote}" appears more than once; quote words that appear only once`);
  }

  // What a listener noticed is chosen from what Measure counted, never added to it.
  for (const item of output.noticed) {
    const found = locate(transcript, item.quote);
    if (found !== null && !wasCounted(item.kind, item.quote, found, transcript, metrics)) {
      problems.push(`noticed ${item.kind} "${item.quote}" is not one of the counted items; choose only from those`);
    }
  }
  return problems;
}

// The times plain code adds to a reply that mapProblems passed.
export function placeSteps(output: MapOutput, transcript: Transcript): Omit<SavedMap, 'version'> {
  const words = transcript.words;
  const firstStart = words[0].start;
  const lastEnd = words[words.length - 1].end;

  const starts = stepWords(output, transcript).map((at, i) => {
    if (at === null) throw new Error(`step ${i + 1} could not be placed`);
    return words[at].start;
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

// One try, plus one more if the model errors or fails a check above. The second try is told why.
export function mapAnswer(input: Input, model: Model, { onAttemptFailed }: Options = {}): Promise<SavedMap> {
  if (input.transcript.words.length === 0) return Promise.reject(new Error('there are no words to map'));
  return twice(async (previousError) => {
    const output = await model.generate({
      prompt: mapPrompt,
      input: {
        question: input.question,
        transcript: transcriptWithPauses(input.transcript),
        stoppedByTimeLimit: input.stoppedByTimeLimit,
        counted: countedItems(input.metrics),
        ...(previousError ? { previousAttemptProblem: problemOf(previousError) } : {}),
      },
      schema: mapOutputSchema,
    });
    const problems = mapProblems(output, input.transcript, input.metrics);
    if (problems.length > 0) throw new Error(`map reply rejected: ${problems.join('; ')}`);
    return { ...placeSteps(output, input.transcript), version: mapVersion };
  }, onAttemptFailed);
}
