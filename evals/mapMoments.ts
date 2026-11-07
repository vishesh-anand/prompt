import { placeMoments } from '../supabase/functions/_shared/pipeline/map.ts';
import { savedMapSchema, type SavedMap } from '../supabase/functions/_shared/schemas/map.ts';
import type { Transcript } from '../supabase/functions/_shared/schemas/metrics.ts';

// The logic of `npm run map:moments` (map-moments.ts): maps saved before step D2 get the moment times and step openings
// that plain code now adds, from their saved transcript. No AI. Nothing else on the map changes.

// The map with its moments placed, or null when there is nothing to do: no map, a map that doesn't load, no words, or
// moments already placed (so a run can be started again).
export function mapWithMoments(savedMap: unknown, transcript: Transcript): SavedMap | null {
  const parsed = savedMapSchema.safeParse(savedMap);
  if (!parsed.success || transcript.words.length === 0) return null;
  const placed = placeMoments(parsed.data, transcript);
  return JSON.stringify(placed) === JSON.stringify(parsed.data) ? null : placed;
}
