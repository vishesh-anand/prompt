import { z } from 'npm:zod@4';

import { coach } from '../supabase/functions/_shared/pipeline/coach.ts';
import { judge } from '../supabase/functions/_shared/pipeline/judge.ts';
import { measure } from '../supabase/functions/_shared/pipeline/measure.ts';
import { updateNotebook } from '../supabase/functions/_shared/pipeline/notebook.ts';
import { chooseFocus } from '../supabase/functions/_shared/pipeline/tipFocus.ts';
import { stoppedByTimeLimit } from '../supabase/functions/_shared/pipeline/transcriptText.ts';
import { coachPrompt } from '../supabase/functions/_shared/prompts/coach.ts';
import { coachCheckPrompt } from '../supabase/functions/_shared/prompts/coachCheck.ts';
import { notebookPrompt } from '../supabase/functions/_shared/prompts/notebook.ts';
import { anthropicModel, type Usage } from '../supabase/functions/_shared/providers/anthropic.ts';
import { maxTipWords, tipWordsTarget, wordCount } from '../supabase/functions/_shared/schemas/coaching.ts';
import { savedJudgementSchema } from '../supabase/functions/_shared/schemas/judgement.ts';
import type { Clip } from './score.ts';
import { newWords } from './novelty.ts';
import { loadTranscripts } from './transcripts.ts';

// Run from this folder with `npm run evals:coach` (add `-- --limit 1` to try one clip). Runs the real Judge, Coach and
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
async function check(transcriptText: string, rewrite: string, tip: string, focus: unknown) {
  return await checker.generate({ prompt: coachCheckPrompt, input: { transcript: transcriptText, rewrite, tip, focus }, schema: checkSchema });
}

type Row = {
  clip: string;
  run: number;
  focus: string;
  tipSentences: number;
  tipWords: number;
  tipProblems: string[];
  lengthRatio: number;
  novelNumbers: string[];
  novelNames: string[];
  novelWords: number;
  unsupported: { text: string; why: string }[];
  tipAddressesFocus: boolean;
  tipReason: string;
  seconds: number;
  error?: string;
};
const rows: Row[] = [];
const examples: string[] = ['# Coach examples (full text, stays on this Mac)', ''];
const controls: { name: string; caught: boolean; flagged: number }[] = [];

const judgeModel = modelFor('judge', pipelineModel);
const coachModel = modelFor('coach', pipelineModel);
const notebookModel = modelFor('notebook', pipelineModel);
const transcribeCost: number[] = [];

for (const clip of clips) {
  const short = clip.answerId.slice(0, 8);
  const { transcript, durationMs, timeLimitMs } = transcripts.get(clip.answerId)!;
  const timeLimit = stoppedByTimeLimit(durationMs, timeLimitMs);
  const metrics = measure({ transcript });
  transcribeCost.push((durationMs / 60_000) * transcribePerMinute);
  const text = transcript.words.map((w) => w.punctuated).join(' ');

  const judged = await judge({ question: clip.question!, transcript, stoppedByTimeLimit: timeLimit }, judgeModel);
  const judgement = savedJudgementSchema.parse({ ...judged.judgement, mainPointAtSeconds: judged.mainPointAtSeconds });
  const focus = chooseFocus({ metrics, judgement, stoppedByTimeLimit: timeLimit });

  for (let run = 1; run <= runsPerClip; run++) {
    const started = performance.now();
    try {
      const coaching = await coach({ question: clip.question!, transcript, focus, notebook: '', stoppedByTimeLimit: timeLimit }, coachModel);
      if (run === 1) await updateNotebook({ previousNotes: '', judgement, metrics, tip: coaching.tip }, notebookModel);
      const seconds = (performance.now() - started) / 1000;
      const checked = await check(text, coaching.betterVersion, coaching.tip, focus);
      const novelty = newWords(transcript, coaching.betterVersion);
      const sentences = (coaching.tip.match(/[.!?](\s|$)/g) ?? []).length;
      const lower = coaching.tip.toLowerCase();
      const tipProblems = [
        ...(sentences > 2 ? [`${sentences} sentences`] : []),
        ...(wordCount(coaching.tip) > maxTipWords ? [`${wordCount(coaching.tip)} words`] : []),
        ...(coaching.tip.includes('!') ? ['exclamation mark'] : []),
        ...bannedPraise.filter((p) => lower.includes(p)).map((p) => `generic praise: "${p}"`),
      ];
      rows.push({
        clip: short, run, focus: focus.kind, tipSentences: sentences, tipWords: wordCount(coaching.tip), tipProblems,
        lengthRatio: coaching.betterVersion.split(/\s+/).length / transcript.words.length,
        novelNumbers: novelty.numbers, novelNames: novelty.names, novelWords: novelty.words.length,
        unsupported: checked.unsupported, tipAddressesFocus: checked.tipAddressesFocus, tipReason: checked.tipReason, seconds,
      });
      examples.push(`## Clip ${short}, run ${run} (focus: ${focus.kind})`, '', `Tip: ${coaching.tip}`, '', `Better version: ${coaching.betterVersion}`, '', `New words: ${novelty.words.join(', ') || 'none'}`, `Tip vs focus: ${checked.tipAddressesFocus ? 'on focus' : 'off focus'} (${checked.tipReason})`, `Checker: ${checked.unsupported.length === 0 ? 'nothing unsupported' : checked.unsupported.map((u) => `"${u.text}" (${u.why})`).join('; ')}`, '');

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
      rows.push({ clip: short, run, focus: focus.kind, tipSentences: 0, tipWords: 0, tipProblems: [], lengthRatio: 0, novelNumbers: [], novelNames: [], novelWords: 0, unsupported: [], tipAddressesFocus: false, tipReason: '', seconds: (performance.now() - started) / 1000, error: error instanceof Error ? error.message : String(error) });
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
const onFocus = ok.filter((r) => r.tipAddressesFocus);
const caughtControls = controls.filter((c) => c.caught).length;
const perAnswer = {
  transcription: transcribeCost.reduce((a, b) => a + b, 0) / clips.length,
  judge: cost(usage.judge ?? { in: 0, out: 0 }, pipelineModel) / clips.length,
  coach: cost(usage.coach ?? { in: 0, out: 0 }, pipelineModel) / clips.length / runsPerClip,
  notebook: cost(usage.notebook ?? { in: 0, out: 0 }, pipelineModel) / clips.length,
};
const total = perAnswer.transcription + perAnswer.judge + perAnswer.coach + perAnswer.notebook;
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
  `| Tip follows the countable voice rules (one or two sentences, at most ${maxTipWords} words, no "!", no generic praise) | ${tipsFine.length} of ${ok.length} |`,
  `| Tip length (target ${tipWordsTarget} words) | ${ok.length === 0 ? 'n/a' : `${Math.round(ok.reduce((a, r) => a + r.tipWords, 0) / ok.length)} words on average, longest ${Math.max(...ok.map((r) => r.tipWords))}`} |`,
  `| Tip is about the chosen focus (checker's yes or no) | ${onFocus.length} of ${ok.length} |`,
  `| Better version length compared with the answer | ${ok.length === 0 ? 'n/a' : `${Math.round((ok.reduce((a, r) => a + r.lengthRatio, 0) / ok.length) * 100)}% on average`} |`,
  `| Median time for the coach stage | ${median(ok.map((r) => r.seconds))?.toFixed(1) ?? 'n/a'} s |`,
  `| Failed runs | ${rows.length - ok.length} of ${rows.length} |`,
  '',
  '## Cost per answer',
  '',
  'Real token counts from this run. The checker is only used in evals, so it is not part of the cost.',
  '',
  '| Stage | Cost |',
  '|---|---|',
  `| Transcription (Scribe v2, about ${(clips.reduce((a, c) => a + transcripts.get(c.answerId)!.durationMs, 0) / clips.length / 1000).toFixed(0)} s of audio) | $${perAnswer.transcription.toFixed(4)} |`,
  `| Judge | $${perAnswer.judge.toFixed(4)} |`,
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
  ...(r.tipAddressesFocus ? [] : [`- Clip ${r.clip} run ${r.run}: checker says the tip is not about the chosen focus (${r.focus}): ${r.tipReason}`]),
]);
lines.push(...(problems.length ? problems : ['None.']), ...rows.filter((r) => r.error).map((r) => `- Clip ${r.clip} run ${r.run} failed: ${r.error}`), '');
lines.push('## Per clip', '', '| Clip | Focus | Tip words | Better version vs answer | New words | Checker unsupported |', '|---|---|---|---|---|---|');
for (const r of ok) lines.push(`| ${r.clip} run ${r.run} | ${r.focus} | ${r.tipWords} | ${Math.round(r.lengthRatio * 100)}% | ${r.novelWords} | ${r.unsupported.length} |`);
lines.push('');

await Deno.mkdir('results', { recursive: true });
await Deno.mkdir('out', { recursive: true });
const where = partial ? 'out/coach-partial' : 'results/coach';
await Deno.writeTextFile(`${where}.md`, lines.join('\n'));
await Deno.writeTextFile(`${where}.json`, JSON.stringify({ date: new Date().toISOString(), coachVersion: coachPrompt.version, rows, controls, costPerAnswer: { ...perAnswer, total } }, null, 2));
const examplesFile = partial ? 'out/coach-examples-partial.md' : 'out/coach-examples.md';
await Deno.writeTextFile(examplesFile, examples.join('\n'));
console.log(`\nWrote ${where}.md, ${where}.json and ${examplesFile}`);
