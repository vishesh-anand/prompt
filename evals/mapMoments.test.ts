import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import { placeLabels } from '../supabase/functions/_shared/pipeline/map.ts';
import type { Transcript } from '../supabase/functions/_shared/schemas/metrics.ts';
import { mapWithMoments } from './mapMoments.ts';
import { saveMapSql } from './mapOld.ts';

const said = ['Well,', 'I', 'like', 'cats.', 'They', 'are', 'calm.'];
const transcript: Transcript = { words: said.map((punctuated, i) => ({ text: punctuated.toLowerCase().replace(/[^a-z]/g, ''), punctuated, start: 1 + i, end: 1.5 + i })) };
// A map as saved before step D2: no moment times, no step openings.
const old = {
  point: { restatement: 'You like cats.', quote: 'I like cats' },
  sentences: [
    { sentence: 1, label: 'point' as const },
    { sentence: 2, label: 'support' as const },
  ],
  didntFollow: [],
  restarts: [],
  noticed: [{ kind: 'hedge' as const, quote: 'Well, I like cats', why: 'w' }],
  effort: 1,
  version: 8,
  ...placeLabels(['point', 'support'], transcript),
};

Deno.test('an old map gets its moments and openings, and keeps everything else', () => {
  const placed = mapWithMoments(old, transcript);
  assertEquals(placed?.firstWordAtSeconds, 1);
  assertEquals(placed?.steps.map((s) => s.opening), ['Well, I like cats.', 'They are calm.']);
  assertEquals(placed?.noticed, [{ ...old.noticed[0], atSeconds: 0 }]);
  assertEquals({ ...placed, firstWordAtSeconds: undefined, steps: old.steps, noticed: old.noticed }, { ...old, firstWordAtSeconds: undefined });
});

Deno.test('a map already done, a map that does not load, or no words: nothing to save', () => {
  const placed = mapWithMoments(old, transcript);
  assertEquals(mapWithMoments(placed, transcript), null);
  assertEquals(mapWithMoments({ version: 8 }, transcript), null);
  assertEquals(mapWithMoments(old, { words: [] }), null);
});

Deno.test('the save waits for the map to still be the version it was read as', () => {
  const sql = saveMapSql('0b6d5a3e-1c2f-4a8b-9d0e-123456789abc', mapWithMoments(old, transcript)!, { onlyIfVersion: 8 });
  assertStringIncludes(sql, "and status = 'coached' and (map->>'version')::int = 8 returning id;");
});
