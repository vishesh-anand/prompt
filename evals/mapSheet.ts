import { z } from 'npm:zod@4';

import { type StepLabel, stepLabels } from '../supabase/functions/_shared/schemas/map.ts';

// The owner's hand labels for the Map eval. The owner labels in a sheet that shows the words (out/map-sheet.md, not
// committed, because it holds the transcripts); the labels alone are saved to map-labels.json, which is committed.
// The rules are the map prompt's (supabase/functions/_shared/prompts/map.ts), labelled one sentence at a time.

export type SheetClip = {
  code: string;
  round: string;
  category: string;
  seconds: number;
  timerStopped: boolean;
  question: string;
  sentences: string[];
};

// One clip's labels as saved in map-labels.json. Sentence numbers start at 1, as on the sheet. `point` is the first
// sentence labelled point (null when none is), worked out from the labels.
export type Labels = { question: string; sentences: number; labels: StepLabel[]; point: number | null; restarts: number[] };

// map-labels.json. guideVersion is the map prompt's version the clips were labelled against.
export const labelsFileSchema = z.object({
  guideVersion: z.number(),
  clips: z.record(
    z.string(),
    z.object({
      answerId: z.string(),
      question: z.string(),
      sentences: z.number(),
      labels: z.array(z.enum(stepLabels)),
      point: z.number().nullable(),
      restarts: z.array(z.number()),
    }),
  ),
});

// One clip as read back from the sheet: whatever the owner has typed so far.
export type SheetEntry = { code: string; question: string; restarts: string; labels: string[] };

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

export const sheetIntro = `# Map labels (not committed: it holds your transcripts)

Label every sentence with one word before the "|": direction, point, support, off_track or ending.
The rules are the map prompt's: supabase/functions/_shared/prompts/map.ts.
Exactly one run of sentences in a row is point; with no single point, no sentence is.
- restarts: the numbers of the sentences with a restart, separated by commas, or leave it empty.
- question: correct it if you answered something else (older answers were saved under one placeholder question).
Then run \`npm run evals:map-sheet\` again: finished clips are saved to map-labels.json.
Label every clip before you look at any AI map.
`;

// One clip's part of the sheet, with any labels already saved filled in.
export function sheetSection(clip: SheetClip, saved?: Labels): string {
  const lines = [
    `## ${clip.code}`,
    '',
    `${clip.round} · ${clip.category} · ${clock(clip.seconds)}${clip.timerStopped ? ' · stopped by the timer' : ''}`,
    `question: ${saved?.question ?? clip.question}`,
    `restarts: ${saved ? saved.restarts.join(', ') : ''}`,
    '',
    ...clip.sentences.map((text, i) => `${i + 1}. ${saved?.labels[i] ?? ''} | ${text}`),
    '',
  ];
  return lines.join('\n');
}

// Everything the owner typed, clip by clip.
export function readSheet(text: string): SheetEntry[] {
  const entries: SheetEntry[] = [];
  let current: SheetEntry | null = null;
  for (const line of text.split('\n')) {
    const heading = line.match(/^## (c\d+)\s*$/);
    if (heading) {
      current = { code: heading[1], question: '', restarts: '', labels: [] };
      entries.push(current);
      continue;
    }
    if (!current) continue;
    const field = line.match(/^(question|restarts):(.*)$/);
    if (field) {
      current[field[1] as 'question' | 'restarts'] = field[2].trim();
      continue;
    }
    const sentence = line.match(/^(\d+)\.([^|]*)\|/);
    if (sentence) current.labels[Number(sentence[1]) - 1] = sentence[2].trim();
  }
  return entries;
}

// A typed label in the form the prompt uses: "Off track" and "off-track" become off_track.
function asLabel(typed: string): StepLabel | null {
  const label = typed.toLowerCase().replace(/[\s-]+/g, '_');
  return (stepLabels as readonly string[]).includes(label) ? (label as StepLabel) : null;
}

// Turns one clip from the sheet into saved labels. `todo` when it isn't finished yet; `problems` when it is finished but
// breaks a rule, so the owner can fix it before it counts.
export function checkEntry(entry: SheetEntry, sentenceCount: number): { labels: Labels } | { todo: true } | { problems: string[] } {
  const typed = Array.from({ length: sentenceCount }, (_, i) => entry.labels[i] ?? '');
  if (typed.some((t) => t === '')) return { todo: true };

  const problems: string[] = [];
  const labels = typed.map((t, i) => {
    const label = asLabel(t);
    if (!label) problems.push(`sentence ${i + 1}: "${t}" is not one of ${stepLabels.join(', ')}`);
    return label;
  });

  const pointRows = labels.flatMap((l, i) => (l === 'point' ? [i + 1] : []));
  if (pointRows.some((n, i) => i > 0 && n !== pointRows[i - 1] + 1)) problems.push('point sentences must be one run: exactly one step is point');

  const point = pointRows[0] ?? null;

  const restarts = entry.restarts === '' ? [] : entry.restarts.split(',').map((s) => Number(s.trim()));
  if (restarts.some((n) => !Number.isInteger(n) || n < 1 || n > sentenceCount)) problems.push(`restarts "${entry.restarts}" must be sentence numbers separated by commas`);

  if (entry.question === '') problems.push('the question is empty');
  if (problems.length > 0) return { problems };
  return { labels: { question: entry.question, sentences: sentenceCount, labels: labels as StepLabel[], point, restarts } };
}
