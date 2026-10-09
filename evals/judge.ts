import { judge, type JudgeResult, applyPointTiming, findQuoteStart, secondsIntoAnswer, stoppedByTimeLimit } from '../supabase/functions/_shared/pipeline/judge.ts';
import { anthropicModel, type Usage } from '../supabase/functions/_shared/providers/anthropic.ts';
import { judgePrompt } from '../supabase/functions/_shared/prompts/judge.ts';
import type { Mark } from '../supabase/functions/_shared/schemas/judgement.ts';
import { type Clip, levelsOff } from './score.ts';
import { loadTranscripts, type SavedTranscript } from './transcripts.ts';

// Run from this folder with `npm run evals:judge` (add `-- --limit 1` to try one clip). Sends every clip you scored
// through the real Judge stage, twice per model, and writes results/judge.md. The transcripts are the ones saved on
// each answer, because those are the words you scored and quoted. They stay in the git-ignored out/ folder.

const effort = 'medium';
const runsPerClip = 2;

// US dollars per million tokens (input, output), from Anthropic's model table cached 2026-09-25.
const models = [
  { id: 'sonnet-5', label: 'Claude Sonnet 5', model: 'claude-sonnet-5', inputPrice: 2, outputPrice: 10 },
  { id: 'sonnet-5.5', label: 'Claude Sonnet 5.5', model: 'claude-sonnet-5-5', inputPrice: 2, outputPrice: 10 },
];

const things = ['mainPoint', 'reasonOrExample', 'ending'] as const;
type Thing = (typeof things)[number];
type Scores = Record<Thing, number>;

const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set. Add it to evals/.env (git-ignored), then run again.');

const limitFlag = Deno.args.indexOf('--limit');
const limit = limitFlag >= 0 ? Number(Deno.args[limitFlag + 1]) : Infinity;
// A partial run never overwrites the full report.
const partial = limitFlag >= 0;

const allClips: { clips: Clip[] } = JSON.parse(await Deno.readTextFile('labels.json'));
const clips = allClips.clips
  .filter((c) => c.question && c.judge && things.every((t) => c.judge![t].score !== null && c.judge![t].quote))
  .slice(0, limit);
if (clips.length === 0) throw new Error('No clips with all three scores and quotes in labels.json yet.');

// ---- transcripts ----
const transcripts = await loadTranscripts(clips);
function transcriptOf(clip: Clip): SavedTranscript {
  const one = transcripts.get(clip.answerId);
  if (!one) throw new Error(`No saved transcript for ${clip.answerId}`);
  return one;
}

// ---- your scores, with the same 15-second rule the judge gets ----
const asMark = (score: number): Mark => ({ score: score as 0 | 1 | 2, quotes: ['-'], why: '-' });

function yourScores(clip: Clip): { scores: Scores; warning?: string } {
  const j = clip.judge!;
  const scores: Scores = { mainPoint: j.mainPoint.score!, reasonOrExample: j.reasonOrExample.score!, ending: j.ending.score! };
  const { transcript } = transcriptOf(clip);
  const start = findQuoteStart(transcript, j.mainPoint.quote!);
  if (start === null) return { scores, warning: 'your main-point quote was not found in the transcript, so the 15-second rule was not applied to your score' };
  scores.mainPoint = applyPointTiming(asMark(scores.mainPoint), secondsIntoAnswer(transcript, start)).score;
  return { scores };
}

// ---- the runs ----
type Run = {
  model: string;
  clip: string;
  run: number;
  error?: string;
  scores?: Scores;
  rawMainPoint?: number;
  mainPointAtSeconds?: number;
  seconds: number;
  inputTokens: number;
  outputTokens: number;
  failedAttempts: number;
  detail?: Record<Thing, { quote: string; why: string }>;
};

const runs: Run[] = [];
for (const m of models) {
  let current: Usage[] = [];
  const model = anthropicModel(apiKey, { model: m.model, effort, onUsage: (u) => current.push(u) });
  for (const clip of clips) {
    const { transcript, durationMs } = transcriptOf(clip);
    for (let run = 1; run <= runsPerClip; run++) {
      current = [];
      let failedAttempts = 0;
      const started = performance.now();
      const base = { model: m.id, clip: clip.answerId, run };
      try {
        const result: JudgeResult = await judge({ question: clip.question!, transcript, stoppedByTimeLimit: stoppedByTimeLimit(durationMs) }, model, {
          onAttemptFailed: () => failedAttempts++,
        });
        const j = result.judgement;
        runs.push({
          ...base,
          scores: { mainPoint: j.mainPoint.score, reasonOrExample: j.reasonOrExample.score, ending: j.ending.score },
          mainPointAtSeconds: result.mainPointAtSeconds,
          seconds: (performance.now() - started) / 1000,
          inputTokens: current.reduce((a, u) => a + u.inputTokens, 0),
          outputTokens: current.reduce((a, u) => a + u.outputTokens, 0),
          failedAttempts,
          detail: Object.fromEntries(things.map((t) => [t, { quote: j[t].quotes[0], why: j[t].why }])) as Run['detail'],
        });
      } catch (error) {
        runs.push({
          ...base,
          error: error instanceof Error ? error.message : String(error),
          seconds: (performance.now() - started) / 1000,
          inputTokens: current.reduce((a, u) => a + u.inputTokens, 0),
          outputTokens: current.reduce((a, u) => a + u.outputTokens, 0),
          failedAttempts,
        });
      }
      const last = runs[runs.length - 1];
      console.log(`${m.id} ${clip.answerId.slice(0, 8)} run ${run}: ${last.error ? `FAILED ${last.error}` : JSON.stringify(last.scores)} in ${last.seconds.toFixed(1)}s`);
    }
  }
}

const knownGaps = `## Known gaps in guide v1

- **Timer cut-offs on ending.** Both models score a timer-stopped answer 0 on ending, even when it finished with a wrap-up (clips 3 and 7, and clip 1 for both). Plain code handles it: an answer stopped by the 60-second limit never gets an ending tip.
- **Reason or example is the least reliable mark** (7 of 18 agreed for both models). The guide doesn't say whether support must explain why the point is true, or whether naming activities counts. Plain code ranks it below the other marks when choosing the tip.
- **Clip 7's ending is contested.** Its 2 was set by Claude with the owner's approval, and both models disagree with it.
- **The judge prompt doesn't yet tell the model that the transcript is data, not instructions** (the coach and notebook prompts do). Add it when the guide moves to v2.`;

// ---- the report ----
const pct = (part: number, whole: number) => (whole === 0 ? 'n/a' : `${Math.round((part / whole) * 100)}%`);
const median = (xs: number[]) => (xs.length === 0 ? null : [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]);
const short = (id: string) => id.slice(0, 8);
const clipNumber = (id: string) => clips.findIndex((c) => c.answerId === id) + 1;
const clipTopic = (id: string) => clips.find((c) => c.answerId === id)!.question!;
const trim = (s: string, n = 110) => (s.length > n ? `${s.slice(0, n)}...` : s);
const cost = (r: Run, m: (typeof models)[number]) => (r.inputTokens * m.inputPrice + r.outputTokens * m.outputPrice) / 1_000_000;

const yours = new Map(clips.map((c) => [c.answerId, yourScores(c)]));

const lines: string[] = [
  '# Judge comparison',
  '',
  `Run on ${new Date().toISOString().slice(0, 10)}. Guide: \`${judgePrompt.name}\` version ${judgePrompt.version}. ${clips.length} clips, ${runsPerClip} runs per clip per model, effort \`${effort}\`.`,
  'Generated by `npm run evals:judge` in `/evals`. Your scores come from `labels.json`; the transcripts stay on the Mac in the git-ignored `out/` folder.',
  'Your main-point scores get the same 15-second rule as the judge\'s before they are compared. Clip 7 and clip 8\'s ending scores were set by Claude with your approval; every other score is yours.',
  '',
  '## Summary',
  '',
  '| | Agrees with you (all 3 marks) | Main point | Reason or example | Ending | Same scores run to run (clips) | Failed calls | Median time | Cost per answer |',
  '|---|---|---|---|---|---|---|---|---|',
];

type Tally = { agree: number; total: number };
const perModel: Record<string, { byThing: Record<Thing, Tally>; all: Tally; offBy: [number, number, number] }> = {};

for (const m of models) {
  const mine = runs.filter((r) => r.model === m.id);
  const ok = mine.filter((r) => r.scores);
  const byThing = Object.fromEntries(things.map((t) => [t, { agree: 0, total: 0 }])) as Record<Thing, Tally>;
  const offBy: [number, number, number] = [0, 0, 0];
  for (const r of ok) {
    for (const t of things) {
      const diff = Math.abs(r.scores![t] - yours.get(r.clip)!.scores[t]);
      byThing[t].total++;
      if (diff === 0) byThing[t].agree++;
      offBy[Math.min(diff, 2)]++;
    }
  }
  const all = { agree: things.reduce((a, t) => a + byThing[t].agree, 0), total: things.reduce((a, t) => a + byThing[t].total, 0) };
  perModel[m.id] = { byThing, all, offBy };

  // Consistency: the clips where every run gave the same three scores.
  let steady = 0;
  let steadyClips = 0;
  for (const clip of clips) {
    const these = ok.filter((r) => r.clip === clip.answerId);
    if (these.length < runsPerClip) continue;
    steadyClips++;
    if (these.every((r) => things.every((t) => r.scores![t] === these[0].scores![t]))) steady++;
  }
  const times = median(mine.map((r) => r.seconds));
  const perAnswer = mine.length === 0 ? 0 : mine.reduce((a, r) => a + cost(r, m), 0) / mine.length;
  lines.push(
    `| ${m.label} | ${all.agree} of ${all.total} (${pct(all.agree, all.total)}) | ${byThing.mainPoint.agree} of ${byThing.mainPoint.total} | ${byThing.reasonOrExample.agree} of ${byThing.reasonOrExample.total} | ${byThing.ending.agree} of ${byThing.ending.total} | ${steady} of ${steadyClips} (${pct(steady, steadyClips)}) | ${mine.length - ok.length} of ${mine.length} | ${times === null ? 'n/a' : `${times.toFixed(1)} s`} | $${perAnswer.toFixed(4)} |`,
  );
}

lines.push('', 'Agreement counts each run separately (clips x runs x 3 marks). "Same scores run to run" counts clips where every run gave identical scores on all three marks. Cost uses real token counts, retries included, no prompt caching.', '');
lines.push(
  '## How far off',
  '',
  "A mark is off by one level when it is next to yours (your 2, the judge's 1) and off by two levels when it is the opposite end (your 2, the judge's 0).",
  '',
  '| | Exactly right | Off by one level | Off by two levels |',
  '|---|---|---|---|',
);
for (const m of models) lines.push(`| ${m.label} | ${perModel[m.id].offBy[0]} | ${perModel[m.id].offBy[1]} | ${perModel[m.id].offBy[2]} |`);

lines.push('', '## Where the judge and you differ', '');
for (const m of models) {
  lines.push(`### ${m.label}`, '');
  const rows: string[] = [];
  for (const clip of clips) {
    const these = runs.filter((r) => r.model === m.id && r.clip === clip.answerId);
    for (const t of things) {
      const mine = yours.get(clip.answerId)!.scores[t];
      const got = these.map((r) => (r.scores ? r.scores[t] : '-'));
      if (got.every((g) => g === mine)) continue;
      const first = these.find((r) => r.detail);
      const labels = these.map((r) => (r.scores ? levelsOff(mine, r.scores[t]) : 'no answer'));
      const off = labels.every((l) => l === labels[0]) ? `${labels[0]} in every run` : labels.join(', then ');
      rows.push(`- Clip ${clipNumber(clip.answerId)} (${short(clip.answerId)}), ${t}: you ${mine}, judge ${got.join(' then ')} (${off}).${first?.detail ? ` Judge quoted "${trim(first.detail[t].quote)}" and said: ${first.detail[t].why}` : ''}`);
    }
  }
  lines.push(...(rows.length ? rows : ['No differences.']), '');
}

lines.push('## Failed calls', '');
const failed = runs.filter((r) => r.error);
lines.push(...(failed.length ? failed.map((r) => `- ${r.model}, clip ${clipNumber(r.clip)} run ${r.run}: ${r.error}`) : ['None.']), '');
const retried = runs.filter((r) => r.failedAttempts > 0 && !r.error);
lines.push(`Calls that needed a second try because a quote wasn't in the transcript or the call failed: ${retried.length} of ${runs.length}.`, '');

lines.push(knownGaps, '');
lines.push('## The clips', '');
for (const clip of clips) {
  const y = yours.get(clip.answerId)!;
  lines.push(`- Clip ${clipNumber(clip.answerId)} (${short(clip.answerId)}): ${clipTopic(clip.answerId)} Your scores after the 15-second rule: main point ${y.scores.mainPoint}, reason ${y.scores.reasonOrExample}, ending ${y.scores.ending}.${y.warning ? ` Note: ${y.warning}.` : ''}`);
}
lines.push('');

await Deno.mkdir('results', { recursive: true });
await Deno.mkdir('out', { recursive: true });
const where = partial ? 'out/judge-partial' : 'results/judge';
await Deno.writeTextFile(`${where}.md`, lines.join('\n'));
await Deno.writeTextFile(`${where}.json`, JSON.stringify({ date: new Date().toISOString(), guideVersion: judgePrompt.version, effort, runs }, null, 2));
console.log(`\nWrote ${where}.md and ${where}.json`);
