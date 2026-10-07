import { coachPrompt } from '../prompts/coach.ts';
import type { Model } from '../providers/model.ts';
import { type Coaching, coachingSchema } from '../schemas/coaching.ts';
import type { Transcript } from '../schemas/metrics.ts';
import { transcriptText } from './judge.ts';
import { twice } from './twice.ts';
import type { Focus } from './tipFocus.ts';

// Stage 4: Coach. Claude writes one tip about the focus plain code chose, and a tighter version of the
// person's own answer. Plain code checks the reply before it is saved. Saved in pipeline_version.
export const coachVersion = coachPrompt.version;

// A tip is two or three short sentences. 350 was too tight: a good three-sentence tip with a quoted phrase ran to 379.
export const tipMaxChars = 450;

// The coach gets the transcript, the one focus plain code chose (with the facts about it), and the notebook.
// It is deliberately not given every measurement and mark, because it then mixes in problems that aren't the focus.
type Input = {
  question: string;
  transcript: Transcript;
  focus: Focus;
  notebook: string;
  stoppedByTimeLimit: boolean;
};

type Options = { onAttemptFailed?: (error: Error) => void };

const wordCount = (text: string) => text.split(/\s+/).filter((w) => w !== '').length;

// Everything plain code can check about a reply. An empty list means it is fine to save.
export function coachProblems(coaching: Coaching, transcript: Transcript): string[] {
  const problems: string[] = [];
  const tip = coaching.tip.trim();
  if (tip === '') problems.push('the tip is empty');
  if (tip.length > tipMaxChars) problems.push(`the tip is ${tip.length} characters, more than ${tipMaxChars}`);
  if (tip.split('!').length - 1 > 1) problems.push('the tip has more than one exclamation mark');
  const better = coaching.betterVersion.trim();
  if (better === '') problems.push('the better version is empty');
  // "Tighter" means never longer. This also stops the rewrite from growing new content.
  if (wordCount(better) > transcript.words.length) problems.push(`the better version has ${wordCount(better)} words, more than the ${transcript.words.length} in the answer`);
  return problems;
}

// One try, plus one more if the model errors or breaks one of the checks above.
export function coach(input: Input, model: Model, { onAttemptFailed }: Options = {}): Promise<Coaching> {
  return twice(async () => {
    const coaching = await model.generate({
      prompt: coachPrompt,
      input: {
        question: input.question,
        transcript: transcriptText(input.transcript),
        stoppedByTimeLimit: input.stoppedByTimeLimit,
        focus: input.focus,
        notebook: input.notebook,
      },
      schema: coachingSchema,
    });
    const problems = coachProblems(coaching, input.transcript);
    if (problems.length > 0) throw new Error(`coach reply rejected: ${problems.join('; ')}`);
    return { tip: coaching.tip.trim(), betterVersion: coaching.betterVersion.trim() };
  }, onAttemptFailed);
}
