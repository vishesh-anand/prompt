// The listener check's report (ARCHITECTURE.md, Evals): how much the friends agree, and what they chose in the pairs.
// Reads the ratings through the Supabase CLI (signed in as you). Numbers and pseudonyms go to results/listener.md;
// what friends wrote goes to the git-ignored out/listener-text.md. R0 is the owner's own test link and never counts.
// Correlations with the measures in listener/preregistered.md, and the AI comparison, come with steps B and C.
import manifest from '../supabase/functions/listener-check/clips.json' with { type: 'json' };
import { manifestSchema } from '../supabase/functions/listener-check/listenerCheck.ts';
import { bootstrap, icc, iccWords } from './listenerStats.ts';

type Row = {
  rater: string;
  clip: string;
  point: string;
  effort: number;
  has_support: boolean;
  clear_ending: boolean;
  would_cut: boolean;
  stood_out: string | null;
  easier: string | null;
};

const clips = manifestSchema.parse(manifest).clips;
const roundOf = new Map(clips.map((c) => [c.code, c.round]));
const retryOfCode = new Map(clips.map((c) => [c.code, c.retryOf]));

const { success, stdout, stderr } = await new Deno.Command('npx', {
  args: ['supabase', 'db', 'query', '--linked', 'select rater, clip, point, effort, has_support, clear_ending, would_cut, stood_out, easier from public.listener_ratings order by clip, rater'],
  stdout: 'piped',
  stderr: 'piped',
}).output();
if (!success) throw new Error(`Could not read the ratings: ${new TextDecoder().decode(stderr)}`);
const out = new TextDecoder().decode(stdout);
const rows: Row[] = (JSON.parse(out.slice(out.indexOf('{'))).rows as Row[]).filter((r) => r.rater !== 'R0');

const main = rows.filter((r) => roundOf.get(r.clip) === 'main');
const raters = [...new Set(main.map((r) => r.rater))].sort();
const byClip = Map.groupBy(main, (r) => r.clip);
// Only clips every friend rated: the agreement sums need a full table.
const complete = [...byClip.entries()].filter(([, rs]) => rs.length === raters.length).sort(([a], [b]) => a.localeCompare(b));
const table = complete.map(([, rs]) => raters.map((name) => rs.find((r) => r.rater === name)!));

const pct = (part: number, whole: number) => (whole ? `${Math.round((100 * part) / whole)}%` : '–');
const fixed = (x: number) => x.toFixed(2);
const lines: string[] = ['# Listener check', ''];
lines.push(`Friends: ${raters.join(', ') || 'none yet'}. Main clips rated by all of them: ${complete.length} of ${clips.filter((c) => c.round === 'main').length}.`, '');

lines.push('## How much effort it took (1 = none, 5 = hard work)', '');
if (raters.length >= 2 && table.length >= 2) {
  const scores = table.map((row) => row.map((r) => r.effort));
  const { single, average } = icc(scores);
  const singleRange = bootstrap(scores, (s) => icc(s).single);
  const averageRange = bootstrap(scores, (s) => icc(s).average);
  lines.push(
    '| | Agreement (ICC) | 95% range | Reading of the low end |',
    '|---|---|---|---|',
    `| One friend | ${fixed(single)} | ${fixed(singleRange[0])} to ${fixed(singleRange[1])} | ${iccWords(singleRange[0])} |`,
    `| Average of ${raters.length} | ${fixed(average)} | ${fixed(averageRange[0])} to ${fixed(averageRange[1])} | ${iccWords(averageRange[0])} |`,
    '',
    'Two-way random, absolute agreement. Below .50 poor, .50 to .75 moderate, .75 to .90 good (Koo & Li 2016).',
    '',
  );

  lines.push('## Yes/no questions: clips where every friend gave the same answer', '');
  for (const [key, label] of [['has_support', 'Reason or example'], ['clear_ending', 'Ended clearly'], ['would_cut', "A part they'd cut"]] as const) {
    lines.push(`- ${label}: ${pct(table.filter((row) => row.every((r) => r[key] === row[0][key])).length, table.length)}`);
  }
  lines.push('');
} else {
  lines.push('Needs at least 2 friends and 2 clips they all rated.', '');
}

lines.push('## Pairs: which answer was easier to follow', '');
const choices = main.filter((r) => r.easier !== null);
const pickedRetry = choices.filter((r) => Boolean(retryOfCode.get(r.easier!))).length;
// Each friend hears a pair's two clips in their own order, so a pair is named by its first try, not by the clip rated.
const choicesByPair = Map.groupBy(choices, (r) => retryOfCode.get(r.clip) ?? r.clip);
const allSame = [...choicesByPair.values()].filter((rs) => rs.length === raters.length && rs.every((r) => r.easier === rs[0].easier)).length;
lines.push(`- The retry was picked in ${pickedRetry} of ${choices.length} choices (${pct(pickedRetry, choices.length)}).`);
lines.push(`- Every friend picked the same answer in ${allSame} of ${choicesByPair.size} pairs.`, '');

// Point matching (by hand): listener/point-matches.json, { "c03": { "R1": true, "R2": false } }.
const matches: Record<string, Record<string, boolean>> = await Deno.readTextFile('listener/point-matches.json').then(JSON.parse).catch(() => ({}));
const marks = Object.entries(matches).filter(([clip]) => roundOf.get(clip) === 'main').flatMap(([, byRater]) => Object.entries(byRater));
if (marks.length) {
  lines.push('## Did friends get the point you meant?', '');
  for (const name of raters) {
    const own = marks.filter(([r]) => r === name);
    lines.push(`- ${name}: ${own.filter(([, m]) => m).length} of ${own.length} (${pct(own.filter(([, m]) => m).length, own.length)})`);
  }
  lines.push('');
}

lines.push('## Calibration clips (left out above)', '');
const calibration = Map.groupBy(rows.filter((r) => roundOf.get(r.clip) === 'calibration'), (r) => r.clip);
lines.push(`| Clip | ${raters.join(' | ')} | Spread |`, `|---|${raters.map(() => '---|').join('')}---|`);
for (const [clip, rs] of [...calibration.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const efforts = raters.map((name) => rs.find((r) => r.rater === name)?.effort);
  const known = efforts.filter((e): e is number => e !== undefined);
  lines.push(`| ${clip} | ${efforts.map((e) => e ?? '–').join(' | ')} | ${known.length ? Math.max(...known) - Math.min(...known) : '–'} |`);
}
lines.push('');

await Deno.mkdir('results', { recursive: true });
await Deno.writeTextFile('results/listener.md', lines.join('\n'));

await Deno.mkdir('out', { recursive: true });
const text = ['# What friends wrote (not committed)', ''];
for (const [clip, rs] of Map.groupBy(rows, (r) => r.clip)) {
  text.push(`## ${clip} (${roundOf.get(clip)})`, '');
  for (const r of rs) text.push(`- ${r.rater}, effort ${r.effort}: ${r.point}${r.stood_out ? ` Stood out: ${r.stood_out}` : ''}`);
  text.push('');
}
await Deno.writeTextFile('out/listener-text.md', text.join('\n'));
console.log('Wrote results/listener.md and out/listener-text.md');
