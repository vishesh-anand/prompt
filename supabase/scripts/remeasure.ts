// One-off for build step B: measure every saved answer again from its saved transcript, so old answers get the new
// measurements (pause location, fillers a minute, repeats, hedges, vague words, "and") in the same shape as new ones.
// Measure is plain code, so this costs nothing and calls no AI.
//
//   deno run --allow-run --allow-write supabase/scripts/remeasure.ts           checks only, changes nothing
//   deno run --allow-run --allow-write supabase/scripts/remeasure.ts --write   also writes the update as an SQL file
//   add --accept <answer id>,<answer id> to let those answers' old numbers change, once you have looked at why
//
// Run it after process-answer and weekly-note are deployed with the new shape, so no answer processed afterwards gets
// the old one. Then run the printed `npx supabase db query --linked -f <file>` in a real Terminal. Only `metrics` and
// `pipeline_version.measure` change, never `status`. Answers already measured with this version are skipped, so it is
// safe to run again.
import { z } from 'npm:zod@4';

import { measure, measureVersion } from '../functions/_shared/pipeline/measure.ts';
import { metricsSchema, transcriptSchema } from '../functions/_shared/schemas/metrics.ts';

// The parts that existed before step B, which must come out exactly the same, so no number anyone has seen moves.
const oldShape = z.object({
  wordCount: z.number(),
  fillers: z.object({ total: z.number(), byWord: z.record(z.string(), z.number()) }),
  pace: z.object({ wordsPerMinute: z.number().nullable(), band: z.string().nullable() }),
  restarts: z.object({ count: z.number(), atSeconds: z.array(z.number()) }),
});

const rowSchema = z.object({
  id: z.string(),
  metrics: z.unknown(),
  transcript: z.unknown(),
  measure_version: z.number().nullable(),
});

const write = Deno.args.includes('--write');
const acceptAt = Deno.args.indexOf('--accept');
const accepted = new Set(acceptAt === -1 ? [] : (Deno.args[acceptAt + 1] ?? '').split(','));

const { success, stdout, stderr } = await new Deno.Command('npx', {
  args: [
    'supabase', 'db', 'query', '--linked',
    "select id::text as id, metrics, transcript, (pipeline_version->>'measure')::int as measure_version from public.answers where transcript is not null and metrics is not null order by created_at",
    '-o', 'json',
  ],
  stdout: 'piped',
  stderr: 'piped',
}).output();
const text = new TextDecoder().decode(stdout);
if (!success || !text.includes('{')) throw new Error(`Could not load the answers: ${new TextDecoder().decode(stderr) || text}`);
const rows = z.object({ rows: z.array(rowSchema) }).parse(JSON.parse(text.slice(text.indexOf('{')))).rows;

// Equal as data: the order of keys in a saved object doesn't matter, the order in a list does.
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sorted(v)]));
  return value;
}

const updates: { id: string; metrics: string }[] = [];
const problems: string[] = [];
let skipped = 0;
let midSentence = 0;
let between = 0;
for (const row of rows) {
  if (row.measure_version === measureVersion) {
    skipped++;
    continue;
  }
  const transcript = transcriptSchema.parse(row.transcript);
  const fresh = metricsSchema.parse(measure({ transcript }));
  const old = oldShape.safeParse(row.metrics);
  if (!old.success) {
    problems.push(`${row.id}: the saved measurements are not in the old shape`);
    continue;
  }
  const checks: [string, unknown, unknown][] = [
    ['word count', old.data.wordCount, fresh.wordCount],
    ['fillers', old.data.fillers, { total: fresh.fillers.total, byWord: fresh.fillers.byWord }],
    ['speed', old.data.pace, fresh.pace],
    ['repeats', old.data.restarts, fresh.repeats],
  ];
  const differs = checks.filter(([, was, now]) => !same(was, now));
  if (differs.length > 0 && accepted.has(row.id)) {
    console.log(`  Accepted: ${row.id}: ${differs.map(([name, was, now]) => `${name} was ${JSON.stringify(was)}, now ${JSON.stringify(now)}`).join('; ')}`);
  } else if (differs.length > 0) {
    problems.push(`${row.id}: ${differs.map(([name, was, now]) => `${name} was ${JSON.stringify(was)}, now ${JSON.stringify(now)}`).join('; ')}`);
    continue;
  }
  midSentence += fresh.pauses.filter((p) => p.midSentence).length;
  between += fresh.pauses.filter((p) => !p.midSentence).length;
  updates.push({ id: row.id, metrics: JSON.stringify(fresh) });
}

console.log(`${rows.length} measured answers: ${updates.length} to update, ${skipped} already on version ${measureVersion}, ${problems.length} with a difference.`);
console.log(`Pauses of a second or more in the answers to update: ${midSentence} mid-sentence, ${between} between sentences.`);
for (const problem of problems) console.log(`  ${problem}`);

if (problems.length > 0) {
  console.log('Nothing written: an old number would change. Look at the differences above first.');
  Deno.exit(1);
}
if (!write || updates.length === 0) {
  if (!write) console.log('Checked only. Run again with --write to make the update file.');
  Deno.exit(0);
}

// One statement, so it all applies or nothing does. The JSON comes from Measure (counts and fixed word lists), never from
// free text, so it can't contain the $m$ quote marks.
const values = updates.map((u) => `('${u.id}', $m$${u.metrics}$m$)`).join(',\n  ');
const sql = `update public.answers a
set metrics = v.metrics::jsonb,
    pipeline_version = jsonb_set(coalesce(a.pipeline_version, '{}'::jsonb), '{measure}', '${measureVersion}'::jsonb)
from (values
  ${values}
) as v(id, metrics)
where a.id = v.id::uuid;
`;
const file = await Deno.makeTempFile({ prefix: 'remeasure-', suffix: '.sql' });
await Deno.writeTextFile(file, sql);
console.log(`Written. Run this in a real Terminal:\n  npx supabase db query --linked -f ${file}`);
