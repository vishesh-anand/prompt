import { z } from 'npm:zod@4';

import { coach } from '../supabase/functions/_shared/pipeline/coach.ts';
import { mapAnswer } from '../supabase/functions/_shared/pipeline/map.ts';
import { measure } from '../supabase/functions/_shared/pipeline/measure.ts';
import { updateNotebook } from '../supabase/functions/_shared/pipeline/notebook.ts';
import { chooseFocus } from '../supabase/functions/_shared/pipeline/tipFocus.ts';
import { stoppedByTimeLimit } from '../supabase/functions/_shared/pipeline/transcriptText.ts';
import { coachPrompt } from '../supabase/functions/_shared/prompts/coach.ts';
import { coachCheckPrompt } from '../supabase/functions/_shared/prompts/coachCheck.ts';
import { notebookPrompt } from '../supabase/functions/_shared/prompts/notebook.ts';
import { anthropicModel, type Usage } from '../supabase/functions/_shared/providers/anthropic.ts';
import { maxReasonWords, maxTipWords, maxWhatChangedWords, reasonWordsTarget, tipWordsTarget, wordCount } from '../supabase/functions/_shared/schemas/coaching.ts';
import type { Clip } from './score.ts';
import { newWords } from './novelty.ts';
import { loadTranscripts } from './transcripts.ts';

// Run from this folder with `npm run evals:coach` (add `-- --limit 1` to try one clip). Runs the real Map, Coach and
// Notebook stages on the clips you scored, then checks the coach's work:
//  - the better version never adds a fact, example, number, name or opinion (a plain-code check and a Claude checker),
//  - the tip follows the voice rules that can be counted,
//  - and the checker itself is tested by feeding it rewrites with an invented sentence, which it must catch.
// Full tips and rewrites are written to the git-ignored out/ folder; results/coach.md holds only counts and short problems.

const runsPerClip = 2;
const pipelineModel = { model: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', inputPrice: 2, outputPrice: 10 };
// A stronger model checks the work, so the coach isn't marking its own homework.
const checkerModel = { model: 'claude-opus-5-5', label: 'Claude Opus 5.5', inputPrice: 4, outputPrice: 20 };
// ElevenLabs Scribe v2, dollars per minute of audio (evals/run.ts).
const transcribePerMinute = 0.22 / 60;

const bannedPraise = ['great job', 'amazing', 'awesome', 'well done', 'fantastic', 'excellent work', 'keep it up'];

const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set. Add it to evals/.env (git-ignored), then run again.');

const limitFlag = Deno.args.indexOf('--limit');
const limit = limitFlag >= 0 ? Number(Deno.args[limitFlag + 1]) : Infinity;
// `--clip 21aec571` runs just the clip whose answer id starts with that.
const clipFlag = Deno.args.indexOf('--clip');
const onlyClip = clipFlag >= 0 ? Deno.args[clipFlag + 1] : null;
// A partial run never overwrites the full report.
const partial = limitFlag >= 0 || onlyClip !== null;
const labels: { clips: Clip[] } = JSON.parse(await Deno.readTextFile('labels.json'));
const clips = labels.clips
  .filter((c) => c.question && c.judge && c.judge.mainPoint.score !== null && (onlyClip === null || c.answerId.startsWith(onlyClip)))
  .slice(0, limit);
if (clips.length === 0) throw new Error('No scored clips in labels.json.');
const transcripts = await loadTranscripts(clips);
// Whether each clip's question wants a direct answer, from the question bank. A clip whose question isn't in the bank
// (the owner's early placeholder questions) counts as not wanting one.
const bank: { text: string; wantsDirectAnswer: boolean }[] = JSON.parse(await Deno.readTextFile('../content/questions.json'));
const wantsDirect = (question: string) => bank.find((q) => q.text === question)?.wantsDirectAnswer ?? false;
// The judge still runs in the live pipeline until step F, but not here: its cost per answer is from the coach v5 report.
const judgeCostFromV5 = 0.0075;

// ---- usage per stage ----
const usage: Record<string, { in: number; out: number }> = {};
function modelFor(stage: string, m: { model: string }, effort: 'medium' | 'high' = 'medium') {
  return anthropicModel(apiKey!, {
    model: m.model,
    effort,
    onUsage: (u: Usage) => {
      const s = (usage[stage] ??= { in: 0, out: 0 });
      s.in += u.inputTokens;
      s.out += u.outputTokens;
    },
  });
}
const cost = (tokens: { in: number; out: number }, m: { inputPrice: number; outputPrice: number }) => (tokens.in * m.inputPrice + tokens.out * m.outputPrice) / 1_000_000;

// ---- the checker ----
const checkSchema = z.object({
  unsupported: z.array(z.object({ text: z.string(), why: z.string() })).describe('Claims in the rewrite the transcript does not support'),
  tipAddressesFocus: z.boolean(),
  tipReason: z.string().describe('One sentence saying why the tip is or is not about the focus'),
});
const checker = modelFor('checker', checkerModel, 'high');
// The tip and its reason together, as the card shows them and as the notebook is given them.
const tipCardOf = (c: { tip: string; reason?: string }) => [c.tip, c.reason ?? ''].join(' ').trim();

async function check(transcriptText: string, rewrite: string, tip: string, focus: unknown) {
  return await checker.generate({ prompt: coachCheckPrompt, input: { transcript: transcriptText, rewrite, tip, focus }, schema: checkSchema });
}

type Row = {
  clip: string;
  run: number;
  focus: string;
  tipSentences: number;
  tipWords: number;
  reasonWords: number;
  tipProblems: string[];
  lengthRatio: number;
  novelNumbers: string[];
  novelNames: string[];
  novelWords: number;
  unsupported: { text: string; why: string }[];
  tipAddressesFocus: boolean;
  tipReason: string;
  whatChangedProblems: string[];
  coachSecondTries: number;
  seconds: number;
  error?: string;
};
const rows: Row[] = [];
const examples: string[] = ['# Coach examples (full text, stays on this Mac)', ''];
const controls: { name: string; caught: boolean; flagged: number }[] = [];

const mapModel = modelFor('map', pipelineModel);
let mapSecondTries = 0;
const mapFailures: string[] = [];
const coachModel = modelFor('coach', pipelineModel);
const notebookModel = modelFor('notebook', pipelineModel);
const transcribeCost: number[] = [];

for (const clip of clips) {
  const short = clip.answerId.slice(0, 8);
  const { transcript, durationMs, timeLimitMs } = transcripts.get(clip.answerId)!;
  const timeLimit = stoppedByTimeLimit(durationMs, timeLimitMs);
  const metrics = measure({ transcript });
  const text = transcript.words.map((w) => w.punctuated).join(' ');

  const wantsDirectAnswer = wantsDirect(clip.question!);
  let map;
  try {
    map = await mapAnswer({ question: clip.question!, transcript, metrics, stoppedByTimeLimit: timeLimit }, mapModel, { onAttemptFailed: () => mapSecondTries++ });
  } catch (error) {
    mapFailures.push(`${short}: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`${short}: the map failed twice, so the clip is skipped`);
    continue;
  }
  const focus = chooseFocus({ metrics, map, transcript, wantsDirectAnswer, stoppedByTimeLimit: timeLimit });
  transcribeCost.push((durationMs / 60_000) * transcribePerMinute);

  for (let run = 1; run <= runsPerClip; run++) {
    const started = performance.now();
    let coachSecondTries = 0;
    try {
      const coaching = await coach(
        { question: clip.question!, wantsDirectAnswer, transcript, map, focus, notebook: '', stoppedByTimeLimit: timeLimit },
        coachModel,
        { onAttemptFailed: () => coachSecondTries++ },
      );
      if (run === 1) await updateNotebook({ previousNotes: '', map, metrics, tip: tipCardOf(coaching) }, notebookModel);
      const seconds = (performance.now() - started) / 1000;
      // The checker judges the tip and its reason together, as the card shows them (coach prompt v7 split them).
      const tipCard = tipCardOf(coaching);
      const checked = await check(text, coaching.betterVersion, tipCard, focus);
      const novelty = newWords(transcript, coaching.betterVersion);
      const sentenceCount = (t: string) => (t.match(/[.!?](\s|$)/g) ?? []).length;
      const sentences = sentenceCount(coaching.tip);
      const reason = coaching.reason ?? '';
      const lower = tipCard.toLowerCase();
      const tipProblems = [
        ...(sentences > 1 ? [`tip: ${sentences} sentences`] : []),
        ...(wordCount(coaching.tip) > maxTipWords ? [`tip: ${wordCount(coaching.tip)} words`] : []),
        ...(reason === '' ? ['no reason'] : []),
        ...(sentenceCount(reason) > 1 ? [`reason: ${sentenceCount(reason)} sentences`] : []),
        ...(wordCount(reason) > maxReasonWords ? [`reason: ${wordCount(reason)} words`] : []),
        ...(tipCard.includes('!') ? ['exclamation mark'] : []),
        ...bannedPraise.filter((p) => lower.includes(p)).map((p) => `generic praise: "${p}"`),
      ];
      const changed = coaching.whatChanged ?? '';
      const whatChangedProblems = [
        ...(changed === '' ? ['empty'] : []),
        ...(/[.?!]\s+\S/.test(changed) ? ['more than one sentence'] : []),
        ...(wordCount(changed) > maxWhatChangedWords ? [`${wordCount(changed)} words`] : []),
        ...(changed.includes('!') ? ['exclamation mark'] : []),
        ...bannedPraise.filter((p) => changed.toLowerCase().includes(p)).map((p) => `generic praise: "${p}"`),
      ];
      rows.push({
        clip: short, run, focus: focus.kind, tipSentences: sentences, tipWords: wordCount(coaching.tip), reasonWords: wordCount(reason), tipProblems,
        lengthRatio: coaching.betterVersion.split(/\s+/).length / transcript.words.length,
        novelNumbers: novelty.numbers, novelNames: novelty.names, novelWords: novelty.words.length,
        unsupported: checked.unsupported, tipAddressesFocus: checked.tipAddressesFocus, tipReason: checked.tipReason,
        whatChangedProblems, coachSecondTries, seconds,
      });
      examples.push(`## Clip ${short}, run ${run} (focus: ${focus.kind})`, '', `Tip: ${coaching.tip}`, `Reason: ${reason}`, `Moment: ${coaching.moment ? `${coaching.moment.atSeconds} s, "${coaching.moment.quote}"` : 'none'}`, '', `Better version: ${coaching.betterVersion}`, '', `Steps: ${(coaching.betterSteps ?? []).map((st) => st.label).join(', ')}`, `What changed: ${changed}`, '', `New words: ${novelty.words.join(', ') || 'none'}`, `Tip vs focus: ${checked.tipAddressesFocus ? 'on focus' : 'off focus'} (${checked.tipReason})`, `Checker: ${checked.unsupported.length === 0 ? 'nothing unsupported' : checked.unsupported.map((u) => `"${u.text}" (${u.why})`).join('; ')}`, '');

      // Test the checker once, on the first reply that comes back: it has to catch an invented sentence and an invented detail.
      if (controls.length === 0) {
        const invented = `${coaching.betterVersion} I also won a regional award for this last year.`;
        const swapped = coaching.betterVersion.replace(/\.\s/, '. My manager at Google praised it, and 40 people came. ');
        for (const [name, rewrite] of [['an invented sentence at the end', invented], ['an invented detail in the middle', swapped]] as const) {
          const caught = await check(text, rewrite, coaching.tip, focus);
          controls.push({ name, caught: caught.unsupported.length > 0, flagged: caught.unsupported.length });
        }
      }
    } catch (error) {
      rows.push({ clip: short, run, focus: focus.kind, tipSentences: 0, tipWords: 0, reasonWords: 0, tipProblems: [], lengthRatio: 0, novelNumbers: [], novelNames: [], novelWords: 0, unsupported: [], tipAddressesFocus: false, tipReason: '', whatChangedProblems: [], coachSecondTries, seconds: (performance.now() - started) / 1000, error: error instanceof Error ? error.message : String(error) });
    }
    const last = rows[rows.length - 1];
    console.log(`${short} run ${run}: focus ${last.focus}${last.error ? ` FAILED ${last.error}` : `, unsupported ${last.unsupported.length}, new numbers/names ${last.novelNumbers.length + last.novelNames.length}, tip problems ${last.tipProblems.length}`}`);
  }
}

// ---- the report ----
const ok = rows.filter((r) => !r.error);
const pct = (a: number, b: number) => (b === 0 ? 'n/a' : `${Math.round((a / b) * 100)}%`);
const median = (xs: number[]) => (xs.length === 0 ? null : [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]);
const clean = ok.filter((r) => r.unsupported.length === 0 && r.novelNumbers.length === 0 && r.novelNames.length === 0);
const tipsFine = ok.filter((r) => r.tipProblems.length === 0);
const averageAndLongest = (counts: number[]) =>
  counts.length === 0 ? 'n/a' : `${Math.round(counts.reduce((a, n) => a + n, 0) / counts.length)} words on average, longest ${Math.max(...counts)}`;
const onFocus = ok.filter((r) => r.tipAddressesFocus);
const caughtControls = controls.filter((c) => c.caught).length;
// Clips whose map failed twice have no coach or notebook runs, so those costs are shared by the mapped clips only.
const mapped = Math.max(clips.length - mapFailures.length, 1);
const perAnswer = {
  transcription: transcribeCost.reduce((a, b) => a + b, 0) / mapped,
  map: cost(usage.map ?? { in: 0, out: 0 }, pipelineModel) / clips.length,
  judge: judgeCostFromV5,
  coach: cost(usage.coach ?? { in: 0, out: 0 }, pipelineModel) / mapped / runsPerClip,
  notebook: cost(usage.notebook ?? { in: 0, out: 0 }, pipelineModel) / mapped,
};
const total = perAnswer.transcription + perAnswer.map + perAnswer.judge + perAnswer.coach + perAnswer.notebook;
const focusCounts = Object.entries(Object.groupBy(rows.filter((r) => r.run === 1), (r) => r.focus)).map(([k, v]) => `${k} ${v!.length}`).join(', ');
const trim = (s: string, n = 110) => (s.length > n ? `${s.slice(0, n)}...` : s);

const lines = [
  '# Coach comparison',
  '',
  `Run on ${new Date().toISOString().slice(0, 10)}. Coach prompt v${coachPrompt.version}, notebook prompt v${notebookPrompt.version}, checker prompt v${coachCheckPrompt.version}. ${clips.length} clips, ${runsPerClip} coach runs per clip. Stages use ${pipelineModel.label}; the checker is ${checkerModel.label}.`,
  'Generated by `npm run evals:coach` in `/evals`. The full tips and better versions stay on the Mac in the git-ignored `out/coach-examples.md`.',
  '',
  '## Summary',
  '',
  '| Check | Result |',
  '|---|---|',
  `| Better version adds nothing (checker finds no unsupported claim, and no new number or name) | **${clean.length} of ${ok.length}** (${pct(clean.length, ok.length)}) |`,
  `| Checker finds no unsupported claim | ${ok.filter((r) => r.unsupported.length === 0).length} of ${ok.length} |`,
  `| Test of the checker: caught an invented sentence or detail | ${caughtControls} of ${controls.length} |`,
  `| Tip and reason follow the countable voice rules (each one sentence, tip at most ${maxTipWords} words, reason at most ${maxReasonWords}, no "!", no generic praise) | ${tipsFine.length} of ${ok.length} |`,
  `| Tip length (target ${tipWordsTarget} words) | ${averageAndLongest(ok.map((r) => r.tipWords))} |`,
  `| Reason length (target ${reasonWordsTarget} words) | ${averageAndLongest(ok.map((r) => r.reasonWords))} |`,
  `| Tip is about the chosen focus (checker's yes or no) | ${onFocus.length} of ${ok.length} |`,
  `| Better version length compared with the answer | ${ok.length === 0 ? 'n/a' : `${Math.round((ok.reduce((a, r) => a + r.lengthRatio, 0) / ok.length) * 100)}% on average`} |`,
  `| What changed is one plain sentence (at most ${maxWhatChangedWords} words, no "!", no generic praise) | ${ok.filter((r) => r.whatChangedProblems.length === 0).length} of ${ok.length} |`,
  `| Focus chosen, per clip | ${focusCounts || 'n/a'} |`,
  `| Median time for the coach stage | ${median(ok.map((r) => r.seconds))?.toFixed(1) ?? 'n/a'} s |`,
  `| Coach second tries (a reply refused, then asked again) | ${rows.reduce((a, r) => a + r.coachSecondTries, 0)} in ${rows.length} runs |`,
  `| Map second tries, and maps that failed twice | ${mapSecondTries}, ${mapFailures.length} of ${clips.length} clips |`,
  `| Failed runs | ${rows.length - ok.length} of ${rows.length} |`,
  '',
  '## Cost per answer',
  '',
  'Real token counts from this run. The checker is only used in evals, so it is not part of the cost.',
  '',
  '| Stage | Cost |',
  '|---|---|',
  `| Transcription (Scribe v2, about ${(clips.reduce((a, c) => a + transcripts.get(c.answerId)!.durationMs, 0) / clips.length / 1000).toFixed(0)} s of audio) | $${perAnswer.transcription.toFixed(4)} |`,
  `| Map | $${perAnswer.map.toFixed(4)} |`,
  `| Judge (still runs live until step F; not run here, cost from the coach v5 report) | $${perAnswer.judge.toFixed(4)} |`,
  `| Coach | $${perAnswer.coach.toFixed(4)} |`,
  `| Notebook | $${perAnswer.notebook.toFixed(4)} |`,
  `| **Total** | **$${total.toFixed(4)}** |`,
  `| Checker, evals only | $${(cost(usage.checker ?? { in: 0, out: 0 }, checkerModel) / Math.max(clips.length, 1)).toFixed(4)} per clip |`,
  '',
  '## Test of the checker',
  '',
  ...(controls.length ? controls.map((c) => `- ${c.name}: ${c.caught ? `caught (${c.flagged} claim${c.flagged === 1 ? '' : 's'} flagged)` : '**missed**'}`) : ['Not run.']),
  '',
  '## Problems',
  '',
];
const problems = ok.flatMap((r) => [
  ...r.unsupported.map((u) => `- Clip ${r.clip} run ${r.run}: checker says "${trim(u.text)}" is unsupported: ${u.why}`),
  ...(r.novelNumbers.length ? [`- Clip ${r.clip} run ${r.run}: new number in the better version: ${r.novelNumbers.join(', ')}`] : []),
  ...(r.novelNames.length ? [`- Clip ${r.clip} run ${r.run}: new name in the better version: ${r.novelNames.join(', ')}`] : []),
  ...r.tipProblems.map((p) => `- Clip ${r.clip} run ${r.run}: tip problem: ${p}`),
  ...r.whatChangedProblems.map((p) => `- Clip ${r.clip} run ${r.run}: what changed problem: ${p}`),
  ...(r.tipAddressesFocus ? [] : [`- Clip ${r.clip} run ${r.run}: checker says the tip is not about the chosen focus (${r.focus}): ${r.tipReason}`]),
]);
lines.push(...(problems.length ? problems : ['None.']), ...mapFailures.map((f) => `- Map failed twice on clip ${f}`), ...rows.filter((r) => r.error).map((r) => `- Clip ${r.clip} run ${r.run} failed: ${r.error}`), '');
lines.push('## Per clip', '', '| Clip | Focus | Tip words | Reason words | Better version vs answer | New words | Checker unsupported |', '|---|---|---|---|---|---|---|');
for (const r of ok) lines.push(`| ${r.clip} run ${r.run} | ${r.focus} | ${r.tipWords} | ${r.reasonWords} | ${Math.round(r.lengthRatio * 100)}% | ${r.novelWords} | ${r.unsupported.length} |`);
lines.push('');

await Deno.mkdir('results', { recursive: true });
await Deno.mkdir('out', { recursive: true });
const where = partial ? 'out/coach-partial' : 'results/coach';
await Deno.writeTextFile(`${where}.md`, lines.join('\n'));
await Deno.writeTextFile(`${where}.json`, JSON.stringify({ date: new Date().toISOString(), coachVersion: coachPrompt.version, rows, controls, costPerAnswer: { ...perAnswer, total } }, null, 2));
const examplesFile = partial ? 'out/coach-examples-partial.md' : 'out/coach-examples.md';
await Deno.writeTextFile(examplesFile, examples.join('\n'));
console.log(`\nWrote ${where}.md, ${where}.json and ${examplesFile}`);
