import { z } from 'npm:zod@4';

import { mapAnswer, mapVersion } from '../supabase/functions/_shared/pipeline/map.ts';
import { measure } from '../supabase/functions/_shared/pipeline/measure.ts';
import { stoppedByTimeLimit } from '../supabase/functions/_shared/pipeline/transcriptText.ts';
import { anthropicModel, type Usage } from '../supabase/functions/_shared/providers/anthropic.ts';
import { transcriptSchema } from '../supabase/functions/_shared/schemas/metrics.ts';
import { answersToMap, saveMapSql } from './mapOld.ts';
import type { Clip } from './score.ts';

// Run from this folder with `npm run map:old` (add `-- --limit 1` to map only the next answer, the starting point
// first). Maps every finished answer that has no map from the current prompt version, and saves it to the answer's
// map column on the hosted project, with your Supabase CLI login. Nothing else on the row changes. Measure is re-run in
// memory from the saved transcript, so older answers get the same counts as new ones; the saved metrics stay as they
// are. Safe to run again: it skips answers already done. Paid: one or two Claude calls an answer.

const model = 'claude-sonnet-5-5';
const effort = 'medium';
// US dollars per million tokens, as in map.ts.
const inputPrice = 2;
const outputPrice = 10;

const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set. Add it to evals/.env (git-ignored), then run again.');
const limitFlag = Deno.args.indexOf('--limit');
const limit = limitFlag >= 0 ? Number(Deno.args[limitFlag + 1]) : Infinity;

async function query(sql: string, write = false): Promise<unknown[]> {
  const file = await Deno.makeTempFile({ suffix: '.sql' });
  try {
    await Deno.writeTextFile(file, sql);
    const { success, stdout, stderr } = await new Deno.Command('npx', {
      args: ['supabase', 'db', 'query', '--linked', write ? '--yes' : '--read-only', '-f', file, '-o', 'json'],
      stdout: 'piped',
      stderr: 'piped',
    }).output();
    const text = new TextDecoder().decode(stdout);
    if (!success || !text.includes('{')) throw new Error(`The query failed: ${new TextDecoder().decode(stderr) || text}`);
    return z.object({ rows: z.array(z.unknown()) }).parse(JSON.parse(text.slice(text.indexOf('{')))).rows;
  } finally {
    await Deno.remove(file);
  }
}

const rows = z
  .array(
    z.object({
      id: z.string(),
      created_at: z.string(),
      is_baseline: z.boolean(),
      map_version: z.number().nullable(),
      duration_ms: z.number(),
      time_limit_ms: z.number(),
      question: z.string(),
      transcript: transcriptSchema,
    }),
  )
  .parse(
    await query(`select a.id::text as id, a.created_at::text as created_at, coalesce(a.id = p.baseline_answer_id, false) as is_baseline,
      (a.map->>'version')::int as map_version, a.duration_ms, a.time_limit_ms, q.text as question, a.transcript
      from public.answers a join public.questions q on q.id = a.question_id left join public.profiles p on p.id = a.user_id
      where a.status = 'coached'`),
  );

// Questions you corrected in labels.json (older answers were saved under one placeholder question) win over the saved one.
const handQuestions = new Map(
  (JSON.parse(await Deno.readTextFile('labels.json')).clips as Clip[]).flatMap((c) => (c.question ? [[c.answerId, c.question] as const] : [])),
);

const todo = answersToMap(rows.map((r) => ({ ...r, createdAt: r.created_at, isBaseline: r.is_baseline, mapVersion: r.map_version })), mapVersion).slice(0, limit);
console.log(`${rows.length} finished answers; ${todo.length} to map with prompt version ${mapVersion}.`);

let usage: Usage[] = [];
const claude = anthropicModel(apiKey, { model, effort, onUsage: (u) => usage.push(u) });
let saved = 0;
const failed: string[] = [];
for (const answer of todo) {
  const name = `${answer.id}${answer.isBaseline ? ' (starting point)' : ''}`;
  if (answer.transcript.words.length === 0) {
    console.log(`${name}: no words, skipped`);
    continue;
  }
  try {
    const map = await mapAnswer(
      {
        question: handQuestions.get(answer.id) ?? answer.question,
        transcript: answer.transcript,
        metrics: measure({ transcript: answer.transcript }),
        stoppedByTimeLimit: stoppedByTimeLimit(answer.duration_ms, answer.time_limit_ms),
      },
      claude,
    );
    const written = await query(saveMapSql(answer.id, map), true);
    if (written.length !== 1) throw new Error('not saved: the answer is no longer finished');
    saved++;
    console.log(`${name}: saved`);
  } catch (error) {
    failed.push(answer.id);
    console.log(`${name}: FAILED, ${error instanceof Error ? error.message : String(error)}`);
  }
}

const cost = usage.reduce((sum, u) => sum + (u.inputTokens * inputPrice + u.outputTokens * outputPrice) / 1_000_000, 0);
console.log(`\nSaved ${saved} of ${todo.length}. Cost about $${cost.toFixed(2)}.`);
if (failed.length) console.log(`Failed (run again to retry them): ${failed.join(', ')}`);
