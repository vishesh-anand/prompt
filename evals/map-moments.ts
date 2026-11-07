import { z } from 'npm:zod@4';

import { transcriptSchema } from '../supabase/functions/_shared/schemas/metrics.ts';
import { mapWithMoments } from './mapMoments.ts';
import { saveMapSql } from './mapOld.ts';
import { query } from './supabaseQuery.ts';

// Run from this folder with `npm run map:moments`. Free: plain code, no AI. Adds to every saved map what the feedback
// screen needs to show and play each moment (where the first word starts, each step's opening words, when each quoted
// moment starts), worked out from the answer's saved transcript. Writes only the map column of finished answers, and
// only while the map is still the one read, so it never undoes a newer map. Safe to run again: maps already done are
// skipped.

const rows = z
  .array(z.object({ id: z.string(), map: z.unknown(), transcript: transcriptSchema }))
  .parse(await query(`select id::text as id, map, transcript from public.answers where status = 'coached' and map is not null and transcript is not null`));

let saved = 0;
let skipped = 0;
const failed: string[] = [];
for (const row of rows) {
  const placed = mapWithMoments(row.map, row.transcript);
  if (placed === null) {
    skipped++;
    continue;
  }
  try {
    const written = await query(saveMapSql(row.id, placed, { onlyIfVersion: placed.version }), true);
    if (written.length !== 1) throw new Error('not saved: the answer or its map changed meanwhile');
    saved++;
  } catch (error) {
    failed.push(row.id);
    console.log(`${row.id}: FAILED, ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`${rows.length} mapped answers: ${saved} saved, ${skipped} had nothing to add.`);
if (failed.length) console.log(`Failed (run again to retry them): ${failed.join(', ')}`);
