import type { Judgement } from '@/lib/schemas/judgement';

// A main point that starts later than this, counted from the first spoken word, can't be called clear.
// Same number as latePointSeconds in supabase/functions/_shared/pipeline/judge.ts.
const latePointSeconds = 15;

const mainPointWords = ['Missing', 'Vague', 'Clear'] as const;
const reasonWords = ['None', 'General', 'Specific'] as const;
const endingWords = ['Cut off', 'Fades', 'Lands'] as const;

export type JudgementLine = { label: string; value: string; detail?: string };

// The words the feedback screen shows for the three marks. Always a word, never a bare number or a color.
// When the time limit stopped the answer, the ending says "Time ran out" and not a mark: you didn't choose
// where it ended, so there is nothing fair to score.
export function describeJudgement(judgement: Judgement, { stoppedByTimeLimit }: { stoppedByTimeLimit: boolean }): JudgementLine[] {
  const { mainPoint, reasonOrExample, ending, mainPointAtSeconds } = judgement;
  const late = mainPoint.score > 0 && mainPointAtSeconds > latePointSeconds;
  return [
    { label: 'Main point', value: mainPointWords[mainPoint.score], detail: late ? `Came at ${Math.round(mainPointAtSeconds)} seconds.` : undefined },
    { label: 'Reason or example', value: reasonWords[reasonOrExample.score] },
    { label: 'Ending', value: stoppedByTimeLimit ? 'Time ran out' : endingWords[ending.score] },
  ];
}
