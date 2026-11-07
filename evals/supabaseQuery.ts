import { z } from 'npm:zod@4';

// Runs SQL on the hosted project with your Supabase CLI login and returns the rows. Read-only unless `write` is set.
// Used by the scripts that change saved answers (map-old.ts, map-moments.ts).
export async function query(sql: string, write = false): Promise<unknown[]> {
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
