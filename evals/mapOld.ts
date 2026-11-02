import type { SavedMap } from '../supabase/functions/_shared/schemas/map.ts';

// The logic of `npm run map:old` (map-old.ts), which maps the answers saved before the Map stage ran in the pipeline.

export type SavedAnswer = { id: string; createdAt: string; isBaseline: boolean; mapVersion: number | null };

// The answers that still need a map from this prompt version: the starting point first, then oldest to newest. One
// already mapped by this version is skipped, so a run that stopped part-way can be started again.
export function answersToMap<T extends SavedAnswer>(answers: T[], version: number): T[] {
  return answers
    .filter((a) => a.mapVersion !== version)
    .sort((a, b) => Number(b.isBaseline) - Number(a.isBaseline) || a.createdAt.localeCompare(b.createdAt));
}

// The statement that saves one map. It writes only the map column, and only while the answer is still finished
// (coached), so it never races a pipeline that is running on it. The map goes in as a dollar-quoted string, with a tag
// that can't appear in the map's own text.
export function saveMapSql(answerId: string, map: SavedMap): string {
  if (!/^[0-9a-f-]{36}$/.test(answerId)) throw new Error(`not an answer id: ${answerId}`);
  const json = JSON.stringify(map);
  let tag = 'map';
  while (json.includes(`$${tag}$`)) tag += 'x';
  return `update public.answers set map = $${tag}$${json}$${tag}$::jsonb where id = '${answerId}' and status = 'coached' returning id;`;
}
