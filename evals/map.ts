import { mapAnswer } from '../supabase/functions/_shared/pipeline/map.ts';
import { measure } from '../supabase/functions/_shared/pipeline/measure.ts';
import { splitSentences, stoppedByTimeLimit } from '../supabase/functions/_shared/pipeline/transcriptText.ts';
import { mapPrompt } from '../supabase/functions/_shared/prompts/map.ts';
import { anthropicModel, type Usage } from '../supabase/functions/_shared/providers/anthropic.ts';
import type { SavedMap } from '../supabase/functions/_shared/schemas/map.ts';
import { bootstrap } from './listenerStats.ts';
import { labelsFileSchema } from './mapSheet.ts';
import { type Comparison, compareReadings, problemKinds, readLabels, readMap, type Reading } from './mapScore.ts';
import { loadTranscripts } from './transcripts.ts';

// Run from this folder with `npm run evals:map` (add `-- --limit 1` to try one clip). Runs the real Map stage twice on
// every clip you labelled, and compares it with your labels and with itself. Numbers go to results/map.md; the maps and
// the words go to the git-ignored out/ folder. The first full run is the baseline.

const model = 'claude-sonnet-5-5';
const effort = 'medium';
const runsPerClip = 2;
// US dollars per million tokens, from Anthropic's model table cached 2026-09-25 (the same as evals/judge.ts).
const inputPrice = 2;
const outputPrice = 10;
const shortAnswerSeconds = 45;

const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set. Add it to evals/.env (git-ignored), then run again.');

const limitFlag = Deno.args.indexOf('--limit');
const limit = limitFlag >= 0 ? Number(Deno.args[limitFlag + 1]) : Infinity;
// A partial run never overwrites the full report.
const partial = limitFlag >= 0;

const file = labelsFileSchema.parse(JSON.parse(await Deno.readTextFile('map-labels.json')));
if (file.guideVersion !== mapPrompt.version) throw new Error(`map-labels.json was labelled against guide version ${file.guideVersion}, but the map prompt is version ${mapPrompt.version}. Recheck your labels, then update guideVersion.`);
const clips = Object.entries(file.clips)
  .map(([code, labels]) => ({ code, ...labels }))
  .slice(0, limit);
if (clips.length === 0) throw new Error('No labelled clips in map-labels.json yet. Run npm run evals:map-sheet.');

// Your labels as they were before you saw any map (commit 6947a74). They stay fixed, so a review of the disagreements
// can only ever be read next to them.
const blind = labelsFileSchema.parse(JSON.parse(await Deno.readTextFile('map-labels-blind.json'))).clips;

const transcripts = await loadTranscripts(clips);
const savedOf = (clip: { answerId: string }) => transcripts.get(clip.answerId)!;

// ---- the runs ----
type Run = {
  clip: string;
  run: number;
  map?: SavedMap;
  reading?: Reading;
  error?: string;
  seconds: number;
  inputTokens: number;
  outputTokens: number;
  refusals: string[];
};

const runs: Run[] = [];
let usage: Usage[] = [];
const claude = anthropicModel(apiKey, { model, effort, onUsage: (u) => usage.push(u) });
for (const clip of clips) {
  const { transcript, durationMs, timeLimitMs } = savedOf(clip);
  for (let run = 1; run <= runsPerClip; run++) {
    usage = [];
    const refusals: string[] = [];
    const started = performance.now();
    const base = { clip: clip.code, run, refusals };
    const cost = () => ({
      seconds: (performance.now() - started) / 1000,
      inputTokens: usage.reduce((a, u) => a + u.inputTokens, 0),
      outputTokens: usage.reduce((a, u) => a + u.outputTokens, 0),
    });
    try {
      const map = await mapAnswer(
        { question: clip.question, transcript, metrics: measure({ transcript }), stoppedByTimeLimit: stoppedByTimeLimit(durationMs, timeLimitMs) },
        claude,
        { onAttemptFailed: (e) => refusals.push(e.message) },
      );
      runs.push({ ...base, ...cost(), map, reading: readMap(map, transcript) });
    } catch (error) {
      runs.push({ ...base, ...cost(), error: error instanceof Error ? error.message : String(error) });
    }
    const last = runs[runs.length - 1];
    console.log(`${clip.code} run ${run}: ${last.error ? 'FAILED' : `point ${last.reading!.point}, effort ${last.map!.effort}`} in ${last.seconds.toFixed(1)}s${refusals.length ? ' (second try)' : ''}`);
  }
}

// ---- the sums ----
const yours = new Map(clips.map((c) => [c.code, readLabels(c.labels, c.restarts, savedOf(c).transcript)]));
const spokenSeconds = (code: string) => {
  const { words } = savedOf(clips.find((c) => c.code === code)!).transcript;
  return words[words.length - 1].end - words[0].start;
};
const done = runs.filter((r): r is Run & { reading: Reading; map: SavedMap } => r.reading !== undefined && r.map !== undefined);
const withYours = done.map((r) => ({ clip: r.clip, first: yours.get(r.clip)!, second: r.reading }));
const withBlind = done.flatMap((r) => {
  const before = blind[r.clip];
  const clip = clips.find((c) => c.code === r.clip)!;
  return before ? [{ clip: r.clip, first: readLabels(before.labels, before.restarts, savedOf(clip).transcript), second: r.reading }] : [];
});
const reviewChanges = clips.reduce((sum, c) => sum + (blind[c.code]?.labels.filter((label, i) => label !== c.labels[i]).length ?? 0), 0);
// The clips where both runs worked: the AI against itself.
const twice = clips.flatMap((c) => {
  const [one, two] = [1, 2].map((n) => done.find((r) => r.clip === c.code && r.run === n));
  return one && two ? [{ clip: c.code, first: one.reading, second: two.reading }] : [];
});
const kappaRange = (pairs: { clip: string; first: Reading; second: Reading }[]) => {
  const codes = [...new Set(pairs.map((p) => p.clip))];
  return bootstrap(codes.map((_, i) => [i]), (rows) => compareReadings(rows.flatMap(([i]) => pairs.filter((p) => p.clip === codes[i]))).kappa);
};

const fixed = (x: number) => (Number.isNaN(x) ? 'n/a' : x.toFixed(2));
const pct = (part: number, whole: number) => (whole === 0 ? 'n/a' : `${part} of ${whole} (${Math.round((part / whole) * 100)}%)`);
const median = (xs: number[]) => (xs.length === 0 ? 0 : [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]);
const rangeText = ([low, high]: [number, number]) => (low === undefined ? 'n/a' : `${fixed(low)} to ${fixed(high)}`);
const seconds = (x: number | null) => (x === null ? 'n/a' : `${x.toFixed(1)} s`);

function comparisonRows(c: Comparison, firstName: string, secondName: string): string[] {
  return [
    `- Sentence labels: kappa ${fixed(c.kappa)} over ${c.sentences} sentences.`,
    `- Same point sentence: ${pct(c.samePoint, c.pairs)}.`,
    `- Found a point: ${firstName} ${c.firstFoundPoint}, ${secondName} ${c.secondFoundPoint}. Only ${secondName}: ${c.onlySecondFoundPoint}. Only ${firstName}: ${c.onlyFirstFoundPoint}.`,
    `- Restarts: ${firstName} ${c.firstRestarts}, ${secondName} ${c.secondRestarts}. Same count: ${pct(c.sameRestartCount, c.pairs)}.`,
    `- Seconds to the point: ${seconds(c.secondsToPointDifference)} apart on average, where both have a time.`,
    `- Off-track share: ${Math.round(c.offTrackDifference * 100)} points apart on average.`,
  ];
}

const cost = (r: Run) => (r.inputTokens * inputPrice + r.outputTokens * outputPrice) / 1_000_000;
const short = withYours.filter((p) => spokenSeconds(p.clip) < shortAnswerSeconds);
const long = withYours.filter((p) => spokenSeconds(p.clip) >= shortAnswerSeconds);
const shortClips = new Set(short.map((p) => p.clip)).size;
const refusals = runs.flatMap((r) => r.refusals);

const lines = [
  '# Map eval',
  '',
  `Run on ${new Date().toISOString().slice(0, 10)}. Prompt: \`${mapPrompt.name}\` version ${mapPrompt.version}. ${clips.length} clips, ${runsPerClip} runs each, \`${model}\`, effort \`${effort}\`.`,
  'Generated by `npm run evals:map` in `/evals`. Your labels are in `map-labels.json`, checked by Claude for consistency only (it showed you similar sentences with different labels, and you chose). The maps and the words stay in the git-ignored `out/` folder.',
  '',
  '## Against your labels',
  '',
  `Each run counts on its own. Range for kappa, resampling clips: ${rangeText(kappaRange(withYours))}.`,
  '',
  ...comparisonRows(compareReadings(withYours), 'you', 'AI'),
  '',
  '## Against your blind labels',
  '',
  `Your labels before you saw any map. A review only rechecks disagreements, so this is the low end and the section above the high end. Sentence labels changed since: ${reviewChanges}. Range for kappa: ${rangeText(kappaRange(withBlind))}.`,
  '',
  ...comparisonRows(compareReadings(withBlind), 'you', 'AI'),
  '',
  '## The same result twice',
  '',
  `The first run against the second, on ${twice.length} clips. Range for kappa, resampling clips: ${rangeText(kappaRange(twice))}.`,
  '',
  ...comparisonRows(compareReadings(twice), 'run 1', 'run 2'),
  '',
  '## Short answers',
  '',
  `Under ${shortAnswerSeconds} seconds of speech: ${shortClips} clips. ${shortClips < 5 ? 'Too few to read much into.' : ''}`,
  '',
  '| | Runs | Kappa | Same point | You found a point | AI found a point |',
  '|---|---|---|---|---|---|',
  ...([['Short', short], ['The rest', long]] as const).map(([name, pairs]) => {
    const c = compareReadings(pairs);
    return `| ${name} | ${c.pairs} | ${fixed(c.kappa)} | ${c.samePoint} | ${c.firstFoundPoint} | ${c.secondFoundPoint} |`;
  }),
  '',
  '## Quotes and failures',
  '',
  `- Calls that worked in the end: ${pct(done.length, runs.length)}.`,
  `- Calls that needed a second try: ${pct(runs.filter((r) => r.refusals.length > 0 && !r.error).length, runs.length)}.`,
  `- Every saved map's quotes are real: plain code refuses a reply otherwise.`,
  '',
  ...(refusals.length ? ['Why replies were refused:', '', ...problemKinds(refusals).map((k) => `- ${k.times} x ${k.kind}`), ''] : []),
  '## Speed and cost',
  '',
  `- Median ${median(runs.map((r) => r.seconds)).toFixed(1)} s an answer, second tries included.`,
  `- $${(runs.reduce((a, r) => a + cost(r), 0) / Math.max(runs.length, 1)).toFixed(4)} an answer, from real token counts, no prompt caching.`,
  '',
  '## The clips',
  '',
  '| Clip | Spoken | Your point sentence | AI point sentence (runs) | Your restarts | AI restarts (runs) | Your seconds to point | AI (runs) | Your off-track | AI (runs) | AI effort (runs) |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  ...clips.map((c) => {
    const y = yours.get(c.code)!;
    const these = runs.filter((r) => r.clip === c.code);
    const each = (show: (r: Run & { reading: Reading; map: SavedMap }) => unknown) => these.map((r) => (r.reading && r.map ? show(r as Run & { reading: Reading; map: SavedMap }) : 'failed')).join(', ');
    return `| ${c.code} | ${Math.round(spokenSeconds(c.code))} s | ${y.point ?? 'none'} | ${each((r) => r.reading.point ?? 'none')} | ${y.restarts.length} | ${each((r) => r.reading.restarts.length)} | ${y.pointAtSeconds ?? 'none'} | ${each((r) => r.reading.pointAtSeconds ?? 'none')} | ${y.offTrackShare} | ${each((r) => r.reading.offTrackShare)} | ${each((r) => r.map.effort)} |`;
  }),
  '',
];

// ---- what you read next to it: the words, so not committed ----
const details = ['# Map eval: the maps next to your labels (not committed)', ''];
for (const clip of clips) {
  const { transcript } = savedOf(clip);
  const these = done.filter((r) => r.clip === clip.code);
  const tableRow = (cells: unknown[]) => `| ${cells.join(' | ')} |`;
  details.push(`## ${clip.code}`, '', `question: ${clip.question}`, '');
  details.push(tableRow(['#', 'You', ...these.map((r) => `Run ${r.run}`), 'Sentence']), tableRow(['---', '---', ...these.map(() => '---'), '---']));
  splitSentences(transcript).forEach(({ first, last }, i) => {
    const text = transcript.words.slice(first, last + 1).map((w) => w.punctuated).join(' ').replaceAll('|', '/');
    details.push(tableRow([i + 1, clip.labels[i], ...these.map((r) => r.reading.labels[i]), text]));
  });
  details.push('');
  for (const r of runs.filter((r) => r.clip === clip.code && r.error)) details.push(`Run ${r.run} failed, so it has no labels: ${r.error}`, '');
  for (const r of these) {
    details.push(`Run ${r.run}, effort ${r.map.effort}: ${r.map.point.restatement}`);
    for (const d of r.map.didntFollow) details.push(`- Didn't follow "${d.quote}": ${d.why}`);
    for (const n of r.map.noticed) details.push(`- Noticed ${n.kind}, "${n.quote}": ${n.why}`);
    for (const x of r.map.restarts) details.push(`- Restart: "${x.quote}"`);
    details.push('');
  }
}

await Deno.mkdir('results', { recursive: true });
await Deno.mkdir('out', { recursive: true });
const report = partial ? 'out/map-partial.md' : 'results/map.md';
await Deno.writeTextFile(report, lines.join('\n'));
await Deno.writeTextFile(partial ? 'out/map-details-partial.md' : 'out/map-details.md', details.join('\n'));
await Deno.writeTextFile(partial ? 'out/map-partial.json' : 'out/map.json', JSON.stringify({ date: new Date().toISOString(), promptVersion: mapPrompt.version, model, effort, runs }, null, 2));
console.log(`\nWrote ${report} and the details in out/.`);
