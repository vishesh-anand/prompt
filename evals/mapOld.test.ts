import { assertEquals, assertStringIncludes, assertThrows } from 'jsr:@std/assert@1';

import type { SavedMap } from '../supabase/functions/_shared/schemas/map.ts';
import { answersToMap, saveMapSql } from './mapOld.ts';

const answer = (id: string, createdAt: string, changes: { isBaseline?: boolean; mapVersion?: number | null } = {}) => ({ id, createdAt, isBaseline: false, mapVersion: null, ...changes });

Deno.test('the starting point is mapped first, then the rest from oldest to newest', () => {
  const answers = [answer('c', '2026-10-03'), answer('a', '2026-10-01'), answer('b', '2026-10-02', { isBaseline: true })];
  assertEquals(answersToMap(answers, 8).map((a) => a.id), ['b', 'a', 'c']);
});

Deno.test('an answer already mapped by this version is skipped, and one from an older version is mapped again', () => {
  const answers = [answer('done', '2026-10-01', { mapVersion: 8 }), answer('old', '2026-10-02', { mapVersion: 7 }), answer('none', '2026-10-03')];
  assertEquals(answersToMap(answers, 8).map((a) => a.id), ['old', 'none']);
});

const map = { version: 8, point: { restatement: 'You like $map$ cats.', quote: '' } } as unknown as SavedMap;
const id = '0b6d5a3e-1c2f-4a8b-9d0e-123456789abc';

Deno.test('a map is saved only into the map column of a finished answer, quoted so its text cannot end the string', () => {
  const sql = saveMapSql(id, map);
  assertStringIncludes(sql, `update public.answers set map = $mapx$`);
  assertStringIncludes(sql, `$mapx$::jsonb where id = '${id}' and status = 'coached' returning id;`);
  assertStringIncludes(sql, 'You like $map$ cats.');
});

Deno.test('anything but an answer id is refused', () => {
  assertThrows(() => saveMapSql(`${id}' or true --`, map));
});
