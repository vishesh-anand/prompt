import { z } from 'npm:zod@4';

import { type Transcript, transcriptSchema } from '../supabase/functions/_shared/schemas/metrics.ts';

// The transcripts the pipeline saved on each answer, which are the exact words the owner scored and quoted.
// They are fetched once through the Supabase CLI and kept in the git-ignored out/ folder.
export type SavedTranscript = { durationMs: number; transcript: Transcript };

const saved = z.object({ durationMs: z.number(), transcript: transcriptSchema });
const cacheDir = 'out/transcripts';

export async function loadTranscripts(clips: { answerId: string }[]): Promise<Map<string, SavedTranscript>> {
  await Deno.mkdir(cacheDir, { recursive: true });
  const found = new Map<string, SavedTranscript>();
  const missing: string[] = [];
  for (const clip of clips) {
    try {
      found.set(clip.answerId, saved.parse(JSON.parse(await Deno.readTextFile(`${cacheDir}/${clip.answerId}.json`))));
    } catch {
      missing.push(clip.answerId);
    }
  }
  if (missing.length === 0) return found;

  const ids = missing.map((id) => `'${id}'`).join(',');
  const { success, stdout, stderr } = await new Deno.Command('npx', {
    args: ['supabase', 'db', 'query', '--linked', `select id::text as id, duration_ms, transcript from public.answers where id in (${ids})`, '-o', 'json'],
    stdout: 'piped',
    stderr: 'piped',
  }).output();
  const text = new TextDecoder().decode(stdout);
  if (!success || !text.includes('{')) throw new Error(`Could not load transcripts: ${new TextDecoder().decode(stderr) || text}`);
  const rows = z
    .object({ rows: z.array(z.object({ id: z.string(), duration_ms: z.number(), transcript: transcriptSchema })) })
    .parse(JSON.parse(text.slice(text.indexOf('{')))).rows;
  for (const row of rows) {
    const one = { durationMs: row.duration_ms, transcript: row.transcript };
    await Deno.writeTextFile(`${cacheDir}/${row.id}.json`, JSON.stringify(one));
    found.set(row.id, one);
  }
  return found;
}
