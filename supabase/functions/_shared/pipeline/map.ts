import { mapPrompt } from '../prompts/map.ts';
import type { Model } from '../providers/model.ts';
import { plainWord } from '../providers/transcriber.ts';
import { type MapOutput, mapOutputSchema, type SavedMap, type StepLabel } from '../schemas/map.ts';
import type { Metrics, Transcript } from '../schemas/metrics.ts';
import { longPauseMs } from './measure.ts';
import { findQuote, momentAt, secondsIntoAnswer, sentenceOpening, splitSentences } from './transcriptText.ts';
import { problemOf, twice } from './twice.ts';

// Stage 3 (from step D; step C runs it from the evals only): Map. Claude reads the answer once as a first-time listener
// and returns a label for each numbered sentence, the point, what it didn't follow, restarts and what a listener would
// notice. Plain code checks every quote is real, joins the sentences into steps and works out all the times. It never counts anything: counts stay in Measure, and the model
// only picks which counted items a listener would notice.
export const mapVersion = mapPrompt.version;

type Input = { question: string; transcript: Transcript; metrics: Metrics; stoppedByTimeLimit: boolean };

type Options = { onAttemptFailed?: (error: Error) => void };

type Span = { first: number; last: number };

const round1 = (x: number) => Math.round(x * 10) / 10;

// The answer as numbered sentences, split as on the owner's labelling sheet, one per line, with each long silence
// written where it fell: "2. I went [2.3 s pause] outside." Same length rule as the pauses Measure counts, so the model
// sees the pauses that were counted.
export function numberedSentences(transcript: Transcript): string {
  const words = transcript.words;
  const withPause = (i: number) => {
    const gapMs = i === 0 ? 0 : Math.round((words[i].start - words[i - 1].end) * 1000);
    return gapMs >= longPauseMs ? `[${(gapMs / 1000).toFixed(1)} s pause] ${words[i].punctuated}` : words[i].punctuated;
  };
  return splitSentences(transcript)
    .map(({ first, last }, n) => `${n + 1}. ${words.slice(first, last + 1).map((_, j) => withPause(first + j)).join(' ')}`)
    .join('\n');
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

// Did Measure count a thing of this kind at the quoted moment? Fillers measured before version 5 have no saved
// positions, so for them the quote only has to contain a filler word that was counted somewhere in the answer.
function wasCounted(kind: MapOutput['noticed'][number]['kind'], quote: string, { first, last }: Span, transcript: Transcript, metrics: Metrics): boolean {
  const said = ` ${withoutPauseMarks(quote).split(/\s+/).map(plainWord).filter((w) => w !== '').join(' ')} `;
  const inside = transcript.words.slice(first, last + 1);
  switch (kind) {
    case 'fillers': {
      const at = metrics.fillers.atSeconds;
      if (at === undefined) return Object.keys(metrics.fillers.byWord).some((filler) => said.includes(` ${filler} `));
      return at.some((t) => inside.some((w) => round1(w.start) === t));
    }
    case 'hedge':
      return metrics.hedges.atSeconds.some((at) => inside.some((w) => round1(w.start) === at));
    // A counted mid-sentence pause falls inside the quote or right next to it: the model often quotes the words before
    // the pause, or after it, rather than both. A pause is stored by the end of the word before it.
    case 'pause': {
      const ends = transcript.words.slice(Math.max(first - 1, 0), last + 1).map((w) => round1(w.end));
      return metrics.pauses.some((p) => p.midSentence && ends.includes(p.atSeconds));
    }
    case 'repeat':
      return metrics.repeats.atSeconds.some((at) => inside.some((w) => round1(w.start) === at));
    case 'pattern':
      return true;
  }
}

// Everything plain code can check about a reply. An empty list means it is fine to save.
export function mapProblems(output: MapOutput, transcript: Transcript, metrics: Metrics): string[] {
  const problems: string[] = [];
  if (output.point.restatement.trim() === '') problems.push('the point restatement is empty');

  // Every sentence is labelled once, in order, so each label is the one given for that sentence.
  const sentences = splitSentences(transcript);
  const numbers = output.sentences.map((s) => s.sentence);
  const inOrder = numbers.length === sentences.length && numbers.every((n, i) => n === i + 1);
  if (!inOrder) problems.push(`label sentences 1 to ${sentences.length}, each once and in order (the reply labels ${numbers.join(', ')})`);

  // Exactly one point step when there is a point, none when there isn't, and the point quote is inside it.
  const labels = output.sentences.map((s) => s.label);
  const pointSteps = stepsOf(labels).filter((s) => s.label === 'point');
  const pointQuote = output.point.quote.trim();
  if (pointSteps.length > 1) problems.push(`${pointSteps.length} steps are point; exactly one step is point`);
  if (pointSteps.length === 0 && pointQuote !== '') problems.push('point.quote is given, but no step is point');
  if (pointSteps.length === 1 && pointQuote === '') problems.push('a step is point, but point.quote is empty');
  if (inOrder && pointSteps.length === 1 && pointQuote !== '') {
    const { first, last } = pointSteps[0];
    const found = locate(transcript, pointQuote, sentences[first].first);
    if (found === null || found.last > sentences[last].last) problems.push(`point.quote "${pointQuote}" is not inside the point step`);
  }

  // Every other quote is there, real and said only once, so the moment it names is the right one. Only the point quote
  // may be empty (no point). A second match that overlaps the first ("I think I think" in "I think I think I think")
  // names the same moment, so it doesn't count as said again.
  const quotes = [...output.didntFollow.map((d) => d.quote), ...output.restarts.map((r) => r.quote), ...output.noticed.map((n) => n.quote)];
  if (quotes.some((q) => q.trim() === '')) problems.push('a quote is empty; every didntFollow, restarts and noticed item quotes the words');
  for (const quote of [pointQuote, ...quotes].filter((q) => q.trim() !== '')) {
    const found = locate(transcript, quote);
    if (found === null) problems.push(`"${quote}" is not in the transcript`);
    else if (locate(transcript, quote, found.last + 1) !== null) problems.push(`"${quote}" appears more than once; quote words that appear only once`);
  }

  // The screen writes "It lost the thread here, " in front of this clause (map prompt v9), so it must read on from it.
  for (const item of output.didntFollow) {
    if (!/^when you\b/i.test(item.why.trim())) problems.push(`didntFollow why "${item.why}" must start with "when you"`);
  }

  // A pattern has no fixed next step on the phone, so the map must give one (map prompt v9).
  for (const item of output.noticed) {
    if (item.kind === 'pattern' && (item.nextStep ?? '').trim() === '') problems.push(`noticed pattern "${item.quote}" has no nextStep; give one`);
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

// Neighbouring sentences with the same label, as one step: its label and its first and last sentence (from 0).
function stepsOf(labels: StepLabel[]): { label: StepLabel; first: number; last: number }[] {
  const steps: { label: StepLabel; first: number; last: number }[] = [];
  labels.forEach((label, i) => {
    const step = steps.at(-1);
    if (step?.label === label) step.last = i;
    else steps.push({ label, first: i, last: i });
  });
  return steps;
}

// The steps and times plain code works out from one label per sentence: when each step starts, when the listener first
// knew where the answer was going (the first Direction or Point sentence), and the share of the time spoken that is off
// track. Times are seconds from the first spoken word. The evals read the owner's labels with this too.
export function placeLabels(labels: StepLabel[], transcript: Transcript): Pick<SavedMap, 'steps' | 'pointAtSeconds' | 'offTrackShare'> {
  const words = transcript.words;
  if (words.length === 0) throw new Error('there are no words to place');
  const sentences = splitSentences(transcript);
  if (labels.length !== sentences.length) throw new Error(`${labels.length} labels for ${sentences.length} sentences`);
  const startOf = (i: number) => words[sentences[i].first].start;
  const at = (i: number) => round1(secondsIntoAnswer(transcript, startOf(i)));
  const lastEnd = words[words.length - 1].end;
  const spoken = lastEnd - words[0].start;
  const offTrack = labels.reduce((sum, label, i) => (label === 'off_track' ? sum + ((i + 1 < sentences.length ? startOf(i + 1) : lastEnd) - startOf(i)) : sum), 0);
  const firstDirection = labels.findIndex((l) => l === 'direction' || l === 'point');
  return {
    steps: stepsOf(labels).map(({ label, first }) => ({ label, sentence: first + 1, atSeconds: at(first) })),
    pointAtSeconds: firstDirection === -1 ? null : at(firstDirection),
    offTrackShare: spoken > 0 ? Math.round((offTrack / spoken) * 100) / 100 : 0,
  };
}

// What plain code adds so the screen can show and play each moment (from step D2): where the first word starts in the
// recording, the opening words of each step, and when each quoted moment starts. Safe to run again on a saved map, and
// it changes nothing else. `npm run map:moments` runs it on maps saved before this existed.
export function placeMoments(map: SavedMap, transcript: Transcript): SavedMap {
  if (transcript.words.length === 0) return map;
  const sentences = splitSentences(transcript);
  const at = <T extends { quote: string }>(item: T) => {
    const atSeconds = momentAt(transcript, item.quote);
    return atSeconds === null ? item : { ...item, atSeconds };
  };
  return {
    ...map,
    firstWordAtSeconds: round1(transcript.words[0].start),
    steps: map.steps.map((step) => {
      const sentence = sentences[step.sentence - 1];
      return sentence ? { ...step, opening: sentenceOpening(transcript, sentence) } : step;
    }),
    didntFollow: map.didntFollow.map(at),
    restarts: map.restarts.map(at),
    noticed: map.noticed.map(at),
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
        transcript: numberedSentences(input.transcript),
        stoppedByTimeLimit: input.stoppedByTimeLimit,
        counted: countedItems(input.metrics),
        ...(previousError ? { previousAttemptProblem: problemOf(previousError) } : {}),
      },
      schema: mapOutputSchema,
    });
    const problems = mapProblems(output, input.transcript, input.metrics);
    if (problems.length > 0) throw new Error(`map reply rejected: ${problems.join('; ')}`);
    const labels = output.sentences.map((s) => s.label);
    return placeMoments({ ...output, ...placeLabels(labels, input.transcript), version: mapVersion }, input.transcript);
  }, onAttemptFailed);
}
