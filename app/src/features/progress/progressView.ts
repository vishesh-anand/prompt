import type { WeekAnswer } from '@/lib/schemas/progress';

import { answerAverages, type Averages } from './daySeries';

// What the starting-point block shows. Decided in plain code so every state has a plain sentence.
export type StartView =
  | { kind: 'loading' }
  | { kind: 'none' } // No answer yet, so no starting point.
  | { kind: 'scoring' } // The recording is still being scored.
  | { kind: 'unscorable' } // It had no words we could score.
  | { kind: 'failed' } // It could not be loaded.
  | { kind: 'ready'; numbers: Averages };

type Input = { baselineId: string | null | undefined; loading: boolean; failed: boolean; answer: WeekAnswer | undefined };

export function startView({ baselineId, loading, failed, answer }: Input): StartView {
  if (!baselineId) return { kind: 'none' };
  if (failed) return { kind: 'failed' };
  if (loading || !answer) return { kind: 'loading' };
  if (answer.metrics === null) return { kind: 'scoring' };
  const numbers = answerAverages(answer);
  if (answer.metrics.wordCount === 0 || numbers.fillersPerMinute === null) return { kind: 'unscorable' };
  // Measured but not judged yet: the clear point is still on its way, the other two are real.
  return { kind: 'ready', numbers };
}

export type NoteView =
  | { kind: 'loading' }
  | { kind: 'note'; text: string }
  // Fewer than the needed practice days so far.
  | { kind: 'toGo'; practiceDays: number; daysNeeded: number }
  // Enough days, but the answers are still being scored. The note follows.
  | { kind: 'scoring' }
  // A note is due and is being written, or could not be written yet. Look again shortly.
  | { kind: 'writing' }
  | { kind: 'failed' };

export function noteView(
  reply: { practiceDays: number; daysNeeded: number; note: string | null; writing: boolean } | null,
  failed: boolean,
): NoteView {
  if (reply === null) return failed ? { kind: 'failed' } : { kind: 'loading' };
  if (reply.note !== null) return { kind: 'note', text: reply.note };
  if (reply.writing) return { kind: 'writing' };
  if (reply.practiceDays >= reply.daysNeeded) return { kind: 'scoring' };
  return { kind: 'toGo', practiceDays: reply.practiceDays, daysNeeded: reply.daysNeeded };
}

// The plain sentence for the starting-point block when there are no rows to show, or null when the rows should show.
export function startMessage(start: StartView, comparisonKind: 'rows' | 'none' | null): string | null {
  switch (start.kind) {
    case 'loading':
      return '';
    case 'none':
      return 'Your starting point is your first answer. It appears after you give one.';
    case 'scoring':
      return 'Your starting point is still being scored.';
    case 'unscorable':
      return 'Your starting point had no words we could score.';
    case 'failed':
      return "Your starting point didn't load. It will try again next time you open this tab.";
    case 'ready':
      return comparisonKind === 'rows' ? null : 'Your comparison appears after your first scored answer this week.';
  }
}
