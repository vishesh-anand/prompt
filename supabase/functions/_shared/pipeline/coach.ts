import { coachPrompt } from '../prompts/coach.ts';
import type { Model } from '../providers/model.ts';
import { type Coaching, type CoachingOutput, coachingOutputSchema, wordCount } from '../schemas/coaching.ts';
import type { SavedMap, StepLabel } from '../schemas/map.ts';
import type { Transcript } from '../schemas/metrics.ts';
import { numberedSentences } from './map.ts';
import type { Focus } from './tipFocus.ts';
import { problemOf, twice } from './twice.ts';

// Stage 4: Coach. Claude writes one tip about the focus plain code chose, a tighter version of the person's own answer
// labelled sentence by sentence like the map, and one line saying what changed. Plain code checks the reply before it
// is saved. Saved in pipeline_version.
export const coachVersion = coachPrompt.version;

// The coach gets the answer, how it was built (the map), the one focus plain code chose (with the facts about it), and
// the notebook. It is deliberately not given every measurement, because it then mixes in problems that aren't the focus.
type Input = {
  question: string;
  wantsDirectAnswer: boolean;
  transcript: Transcript;
  map: SavedMap;
  focus: Focus;
  notebook: string;
  stoppedByTimeLimit: boolean;
};

type Options = { onAttemptFailed?: (error: Error) => void };

// Neighbouring sentences with the same label, joined into one step.
function stepsOf(sentences: CoachingOutput['betterSentences']): { label: StepLabel; text: string }[] {
  const steps: { label: StepLabel; text: string }[] = [];
  for (const { label, text } of sentences) {
    const step = steps.at(-1);
    if (step?.label === label) step.text = `${step.text} ${text.trim()}`;
    else steps.push({ label, text: text.trim() });
  }
  return steps;
}

// Everything plain code can check about a reply. An empty list means it is fine to save.
export function coachProblems(output: CoachingOutput, transcript: Transcript, map: SavedMap): string[] {
  const problems: string[] = [];
  const tip = output.tip.trim();
  if (tip === '') problems.push('the tip is empty');
  if (tip.split('!').length - 1 > 1) problems.push('the tip has more than one exclamation mark');

  const better = output.betterSentences.map((s) => s.text.trim());
  if (better.some((s) => s === '')) problems.push('a better version sentence is empty');
  const betterWords = wordCount(better.join(' '));
  // "Tighter" means never longer. This also stops the rewrite from growing new content.
  if (betterWords > transcript.words.length) problems.push(`the better version has ${betterWords} words, more than the ${transcript.words.length} in the answer`);
  if (better.some((s) => /\[[\d.]+ s pause\]|^\d+\.\s/.test(s))) problems.push('the better version copies a pause mark or a sentence number; write only the words');

  // The better version keeps the answer's one point, as one step.
  const pointSteps = stepsOf(output.betterSentences).filter((s) => s.label === 'point').length;
  const answerHasPoint = map.steps.some((s) => s.label === 'point');
  if (pointSteps > 1) problems.push(`the better version has ${pointSteps} point steps; exactly one step is point`);
  if (answerHasPoint && pointSteps === 0) problems.push('the better version has no point step, but the answer has a point; label the sentence that says it point');

  // Only an empty line is refused: a refusal can fail the whole answer, and this line is the least important part of it.
  // Its length, sentences and exclamation marks are counted by `npm run evals:coach` instead.
  if (output.whatChanged.trim() === '') problems.push('whatChanged is empty');
  return problems;
}

// One try, plus one more if the model errors or breaks one of the checks above. The second try is told why the
// first reply was refused (for example, a tip over the word limit).
export function coach(input: Input, model: Model, { onAttemptFailed }: Options = {}): Promise<Coaching> {
  const { map } = input;
  return twice(async (previousError) => {
    const output = await model.generate({
      prompt: coachPrompt,
      input: {
        question: input.question,
        questionWantsDirectAnswer: input.wantsDirectAnswer,
        transcript: numberedSentences(input.transcript),
        stoppedByTimeLimit: input.stoppedByTimeLimit,
        map: {
          steps: map.steps,
          listenerHeard: map.point.restatement,
          didntFollow: map.didntFollow,
          noticed: map.noticed,
        },
        // The tip's moment is for the screen, not the coach: the facts already hold those words.
        focus: { kind: input.focus.kind, facts: input.focus.facts },
        notebook: input.notebook,
        ...(previousError ? { previousAttemptProblem: problemOf(previousError) } : {}),
      },
      // Refuses a tip over the word limit, and the reply is then asked for again.
      schema: coachingOutputSchema,
    });
    const problems = coachProblems(output, input.transcript, map);
    if (problems.length > 0) throw new Error(`coach reply rejected: ${problems.join('; ')}`);
    return {
      tip: output.tip.trim(),
      betterVersion: output.betterSentences.map((s) => s.text.trim()).join(' '),
      betterSteps: stepsOf(output.betterSentences),
      whatChanged: output.whatChanged.trim(),
      ...(input.focus.moment ? { moment: input.focus.moment } : {}),
    };
  }, onAttemptFailed);
}
