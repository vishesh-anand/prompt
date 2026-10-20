// The listener check's setup (ARCHITECTURE.md, Evals). Two jobs:
//   npm run evals:listener-clips                copies every clip in the list into the private eval-clips bucket
//   npm run evals:listener-clips -- --rater R1  makes a secret link for a friend
// Run the second in a real Terminal, so the link never passes through Claude.
import manifest from '../supabase/functions/listener-check/clips.json' with { type: 'json' };
import { manifestSchema } from '../supabase/functions/listener-check/listenerCheck.ts';

const ratersFile = 'out/listener-raters.txt';

async function supabase(args: string[]): Promise<string> {
  const { success, stdout, stderr } = await new Deno.Command('npx', { args: ['supabase', ...args], stdout: 'piped', stderr: 'piped' }).output();
  if (!success) throw new Error(`supabase ${args.join(' ')} failed: ${new TextDecoder().decode(stderr)}`);
  return new TextDecoder().decode(stdout);
}

// Recordings come from the private bucket through the Supabase CLI (signed in as you), into the git-ignored audio/
// folder (the same cache evals/run.ts uses), and go up to eval-clips as cNN.m4a. Clips already there are skipped, so
// running it again only copies what is new.
async function copyClips() {
  const clips = manifestSchema.parse(manifest).clips;
  await Deno.mkdir('audio', { recursive: true });
  const listing = await supabase(['--experimental', 'storage', 'ls', '--linked', 'ss:///eval-clips/']);
  const existing = new Set<string>(JSON.parse(listing.slice(listing.indexOf('{'))).paths ?? []);
  let copied = 0;
  for (const clip of clips) {
    if (existing.has(`${clip.code}.m4a`)) continue;
    const local = `audio/${clip.answerId}.m4a`;
    try {
      await Deno.stat(local);
    } catch {
      await supabase(['--experimental', 'storage', 'cp', '--linked', `ss:///recordings/${clip.audioPath}`, local]);
    }
    await supabase(['--experimental', 'storage', 'cp', '--linked', '--content-type', 'audio/mp4', local, `ss:///eval-clips/${clip.code}.m4a`]);
    copied++;
    console.log(`copied ${clip.code}`);
  }
  console.log(`${copied} copied, ${clips.length - copied} already in eval-clips.`);
}

// A new random token for one friend, kept in the git-ignored out/ folder with the others. The secret holds them all,
// so the command printed at the end sets every friend's link at once.
async function addRater(name: string) {
  if (!/^R\d$/.test(name)) throw new Error('Name friends R1 to R9 (R0 is your own test link).');
  await Deno.mkdir('out', { recursive: true });
  const saved = await Deno.readTextFile(ratersFile).catch(() => '');
  const entries = saved.split('\n').filter((line) => line && !line.startsWith(`${name}:`));
  const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g, '-').replace(/\//g, '_');
  entries.push(`${name}:${token}`);
  await Deno.writeTextFile(ratersFile, entries.join('\n') + '\n');
  console.log(`${name}'s link: <your page address>#t=${token}`);
  console.log('\nNow set the secret (every friend at once, in a real Terminal, from the repo root):');
  console.log(`npx supabase secrets set LISTENER_RATERS="${entries.join(',')}"`);
}

const raterFlag = Deno.args.indexOf('--rater');
if (raterFlag >= 0) await addRater(Deno.args[raterFlag + 1] ?? '');
else await copyClips();
