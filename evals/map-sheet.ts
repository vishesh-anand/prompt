import { z } from 'npm:zod@4';

import manifest from '../supabase/functions/listener-check/clips.json' with { type: 'json' };
import { manifestSchema } from '../supabase/functions/listener-check/listenerCheck.ts';
import { mapPrompt } from '../supabase/functions/_shared/prompts/map.ts';
import { splitSentences, stoppedByTimeLimit } from '../supabase/functions/_shared/pipeline/transcriptText.ts';
import { checkEntry, labelsFileSchema, readSheet, type SheetClip, sheetIntro, sheetSection } from './mapSheet.ts';
import type { Clip } from './score.ts';
import { loadTranscripts } from './transcripts.ts';

// Run from this folder with `npm run evals:map-sheet`. Adds every listener clip (calibration and main) to the labelling
// sheet out/map-sheet.md, then saves each finished clip's labels to map-labels.json. Run it again after labelling: it
// never changes what you typed. If the sheet is lost, it is rebuilt from map-labels.json. No AI calls.

const sheetPath = 'out/map-sheet.md';
const labelsPath = 'map-labels.json';

const clips = manifestSchema.parse(manifest).clips.filter((c) => c.round !== 'candidate');
// A missing file starts empty; a broken one stops here, so saved labels are never overwritten.
const savedText = await Deno.readTextFile(labelsPath).catch(() => null);
const saved = savedText === null ? { guideVersion: mapPrompt.version, clips: {} } : labelsFileSchema.parse(JSON.parse(savedText));
if (saved.guideVersion !== mapPrompt.version) {
  console.log(`Note: map-labels.json was labelled against guide version ${saved.guideVersion}; the map prompt is now version ${mapPrompt.version}.`);
}

// ---- the words, the length and the question of each clip ----
const transcripts = await loadTranscripts(clips);
// Questions you corrected in labels.json (older answers were saved under one placeholder question) win over the saved one.
const handQuestions = new Map(
  (JSON.parse(await Deno.readTextFile('labels.json')).clips as Clip[]).flatMap((c) => (c.question ? [[c.answerId, c.question] as const] : [])),
);
const savedQuestions = await loadQuestions(clips.map((c) => c.answerId));

const sheetClips = clips.map((clip): SheetClip & { answerId: string } => {
  const { transcript, durationMs, timeLimitMs } = transcripts.get(clip.answerId)!;
  const words = transcript.words;
  return {
    code: clip.code,
    answerId: clip.answerId,
    round: clip.round,
    category: clip.category,
    seconds: words.length ? words[words.length - 1].end - words[0].start : 0,
    timerStopped: stoppedByTimeLimit(durationMs, timeLimitMs),
    question: handQuestions.get(clip.answerId) ?? savedQuestions.get(clip.answerId) ?? '',
    sentences: splitSentences(transcript).map(({ first, last }) => words.slice(first, last + 1).map((w) => w.punctuated).join(' ')),
  };
});

// ---- the sheet: keep what is there, add clips that are missing ----
let sheet = await Deno.readTextFile(sheetPath).catch(() => sheetIntro);
const onSheet = new Set(readSheet(sheet).map((e) => e.code));
const added = sheetClips.filter((c) => !onSheet.has(c.code));
for (const clip of added) sheet = `${sheet.trimEnd()}\n\n${sheetSection(clip, saved.clips[clip.code])}`;
await Deno.mkdir('out', { recursive: true });
await Deno.writeTextFile(sheetPath, `${sheet.trimEnd()}\n`);

// ---- save finished clips ----
const todo: string[] = [];
const problems: string[] = [];
for (const entry of readSheet(sheet)) {
  const clip = sheetClips.find((c) => c.code === entry.code);
  if (!clip) continue;
  const result = checkEntry(entry, clip.sentences.length);
  if ('todo' in result) todo.push(entry.code);
  else if ('problems' in result) problems.push(...result.problems.map((p) => `${entry.code}: ${p}`));
  else saved.clips[entry.code] = { answerId: clip.answerId, ...result.labels };
}
const sorted = Object.fromEntries(Object.entries(saved.clips).sort(([a], [b]) => a.localeCompare(b)));
await Deno.writeTextFile(
  labelsPath,
  `${JSON.stringify(
    {
      _help:
        "Your hand labels for the Map eval, made with npm run evals:map-sheet (the words are in the git-ignored out/map-sheet.md). For each listener clip: one label per sentence, the first sentence labelled point (null = none), the sentences with a restart (numbers start at 1), and the question you answered. guideVersion is the map prompt's version you labelled against.",
      guideVersion: saved.guideVersion,
      clips: sorted,
    },
    null,
    2,
  )}\n`,
);

console.log(`Sheet: ${sheetPath} (${added.length} clips added). Saved: ${Object.keys(sorted).length} of ${sheetClips.length} clips in ${labelsPath}.`);
if (todo.length) console.log(`Still to label: ${todo.join(', ')}`);
if (problems.length) console.log(`Fix these on the sheet, then run again:\n- ${problems.join('\n- ')}`);

async function loadQuestions(answerIds: string[]): Promise<Map<string, string>> {
  const ids = answerIds.map((id) => `'${id}'`).join(',');
  const { success, stdout, stderr } = await new Deno.Command('npx', {
    args: ['supabase', 'db', 'query', '--linked', `select a.id::text as id, q.text from public.answers a join public.questions q on q.id = a.question_id where a.id in (${ids})`, '-o', 'json'],
    stdout: 'piped',
    stderr: 'piped',
  }).output();
  const text = new TextDecoder().decode(stdout);
  if (!success || !text.includes('{')) throw new Error(`Could not load the questions: ${new TextDecoder().decode(stderr) || text}`);
  const rows = z.object({ rows: z.array(z.object({ id: z.string(), text: z.string() })) }).parse(JSON.parse(text.slice(text.indexOf('{')))).rows;
  return new Map(rows.map((r) => [r.id, r.text]));
}
