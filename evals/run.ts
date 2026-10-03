import { measure } from '../supabase/functions/_shared/pipeline/measure.ts';
import { assemblyAiTranscriber } from '../supabase/functions/_shared/providers/assemblyai.ts';
import { deepgramTranscriber } from '../supabase/functions/_shared/providers/deepgram.ts';
import { elevenLabsTranscriber } from '../supabase/functions/_shared/providers/elevenlabs.ts';
import type { Transcriber } from '../supabase/functions/_shared/providers/transcriber.ts';
import type { Metrics } from '../supabase/functions/_shared/schemas/metrics.ts';
import { type Clip, rawHesitations, scoreFillers, scoreHesitations, wordErrorRate } from './score.ts';

// Run from this folder with `npm run evals`. Sends every labelled clip through every setup below, using the same
// Transcriber files and the same Measure stage as the pipeline, and writes results/transcribers.md.

// Prices in US dollars per minute of audio, from each provider's pricing page on 2026-10-03.
// Deepgram no longer lists Nova-2, so its price is the Nova-3 one.
const setups: { id: string; label: string; costPerMinute: number; make: () => Transcriber | null }[] = [
  { id: 'dg-nova-2', label: 'Deepgram Nova-2 (current)', costPerMinute: 0.0043, make: () => withKey('DEEPGRAM_API_KEY', (k) => deepgramTranscriber(k, { model: 'nova-2' })) },
  { id: 'dg-nova-3', label: 'Deepgram Nova-3', costPerMinute: 0.0043, make: () => withKey('DEEPGRAM_API_KEY', (k) => deepgramTranscriber(k, { model: 'nova-3' })) },
  { id: 'aai-u2', label: 'AssemblyAI Universal-2', costPerMinute: 0.15 / 60, make: () => withKey('ASSEMBLYAI_API_KEY', (k) => assemblyAiTranscriber(k, { model: 'universal-2' })) },
  { id: 'aai-u35', label: 'AssemblyAI Universal-3.5 Pro', costPerMinute: 0.21 / 60, make: () => withKey('ASSEMBLYAI_API_KEY', (k) => assemblyAiTranscriber(k, { model: 'universal-3-5-pro' })) },
  { id: 'el-scribe', label: 'ElevenLabs Scribe v2', costPerMinute: 0.22 / 60, make: () => withKey('ELEVENLABS_API_KEY', (k) => elevenLabsTranscriber(k, { model: 'scribe_v2' })) },
];

function withKey(name: string, build: (key: string) => Transcriber): Transcriber | null {
  const key = Deno.env.get(name);
  return key ? build(key) : null;
}

type Run = {
  clip: string;
  setup: string;
  error?: string;
  turnaroundSeconds?: number;
  wordsPerMinute?: number | null;
  pauses?: number;
  restarts?: number;
  hesitations?: ReturnType<typeof scoreHesitations> | null;
  fillers?: ReturnType<typeof scoreFillers> | null;
  fillersFound?: Metrics['fillers']['byWord'];
  spellings?: Record<string, number>;
  wer?: number | null;
};

const labels: { clips: Clip[] } = JSON.parse(await Deno.readTextFile('labels.json'));
await Deno.mkdir('audio', { recursive: true });
await Deno.mkdir('out', { recursive: true });

// Recordings come from the private bucket through the Supabase CLI (signed in as you) and stay in the git-ignored audio/ folder.
async function fetchAudio(clip: Clip): Promise<Uint8Array> {
  const path = `audio/${clip.answerId}.m4a`;
  try {
    return await Deno.readFile(path);
  } catch {
    const { success, stderr } = await new Deno.Command('npx', {
      args: ['supabase', '--experimental', 'storage', 'cp', '--linked', `ss:///recordings/${clip.audioPath}`, path],
      stdout: 'null',
      stderr: 'piped',
    }).output();
    if (!success) throw new Error(`Could not download ${clip.audioPath}: ${new TextDecoder().decode(stderr)}`);
    return await Deno.readFile(path);
  }
}

const runs: Run[] = [];
for (const clip of labels.clips) {
  const short = clip.answerId.slice(0, 8);
  const audio = await fetchAudio(clip);
  for (const setup of setups) {
    const transcriber = setup.make();
    if (!transcriber) {
      runs.push({ clip: short, setup: setup.id, error: 'no API key in .env' });
      continue;
    }
    const started = performance.now();
    try {
      const transcript = await transcriber.transcribe(audio);
      const turnaroundSeconds = (performance.now() - started) / 1000;
      const metrics = measure({ transcript });
      await Deno.writeTextFile(`out/${short}-${setup.id}.txt`, transcript.words.map((w) => w.punctuated).join(' '));
      runs.push({
        clip: short,
        setup: setup.id,
        turnaroundSeconds,
        wordsPerMinute: metrics.pace.wordsPerMinute,
        pauses: metrics.pauses.count,
        restarts: metrics.restarts.count,
        hesitations: clip.hesitations === null ? null : scoreHesitations(metrics, clip.hesitations),
        fillers: clip.fillers === null ? null : scoreFillers(metrics, clip.fillers),
        fillersFound: metrics.fillers.byWord,
        spellings: rawHesitations(transcript),
        wer: wordErrorRate(clip.reference, transcript),
      });
      console.log(`${short} ${setup.id}: done in ${turnaroundSeconds.toFixed(1)}s`);
    } catch (error) {
      runs.push({ clip: short, setup: setup.id, error: error instanceof Error ? error.message : String(error) });
      console.log(`${short} ${setup.id}: FAILED ${runs[runs.length - 1].error}`);
    }
  }
}

// ---- the report ----
const pct = (part: number, whole: number) => (whole === 0 ? 'n/a' : `${Math.round((part / whole) * 100)}%`);
const sum = (numbers: number[]) => numbers.reduce((a, b) => a + b, 0);
const mean = (numbers: number[]) => (numbers.length === 0 ? null : sum(numbers) / numbers.length);
const of = (found: number | undefined, expected: number | null | undefined) => `${found}${typeof expected === 'number' ? ` of ${expected}` : ''}`;
const spelled = (s: Record<string, number> = {}) => Object.entries(s).map(([w, n]) => `${w}×${n}`).join(' ') || 'none';

const lines: string[] = [
  '# Voice-to-text comparison',
  '',
  `Run on ${new Date().toISOString().slice(0, 10)}. ${labels.clips.length} clips, ${setups.length} setups. Fillers kept and word timings on for all of them.`,
  'Generated by `npm run evals` in `/evals`. Transcripts stay on the Mac in the git-ignored `out/` folder.',
  '',
  '## Summary',
  '',
  'Hesitations (um, uh, ah as one group) are the deciding number. Other fillers: so, like, actually, basically, you know.',
  'Turnaround is measured from a Mac, so it is a rough guide only.',
  '',
  '| Setup | Hesitations caught | Hesitations extra | Other fillers caught | missed | extra | Word mistakes | Turnaround | Cost / min |',
  '|---|---|---|---|---|---|---|---|---|',
];
for (const setup of setups) {
  const mine = runs.filter((r) => r.setup === setup.id);
  const ok = mine.filter((r) => !r.error);
  const h = ok.flatMap((r) => (r.hesitations ? [r.hesitations] : []));
  const f = ok.flatMap((r) => (r.fillers ? [r.fillers.all] : []));
  const wer = mean(ok.flatMap((r) => (typeof r.wer === 'number' ? [r.wer] : [])));
  const turnaround = mean(ok.flatMap((r) => (r.turnaroundSeconds === undefined ? [] : [r.turnaroundSeconds])));
  const failed = mine.length - ok.length;
  lines.push(
    `| ${setup.label}${failed ? ` (${failed} failed)` : ''} | ${sum(h.map((x) => x.caught))} of ${sum(h.map((x) => x.expected))} (${pct(sum(h.map((x) => x.caught)), sum(h.map((x) => x.expected)))}) | ${sum(h.map((x) => x.extra))} | ${sum(f.map((x) => x.caught))} of ${sum(f.map((x) => x.expected))} | ${sum(f.map((x) => x.missed))} | ${sum(f.map((x) => x.extra))} | ${wer === null ? 'n/a' : `${(wer * 100).toFixed(1)}%`} | ${turnaround === null ? 'n/a' : `${turnaround.toFixed(1)} s`} | $${setup.costPerMinute.toFixed(4)} |`,
  );
}

lines.push('', '## Per clip', '');
for (const clip of labels.clips) {
  const short = clip.answerId.slice(0, 8);
  lines.push(`### ${short}: ${clip.note}`, '');
  lines.push(`Your count: ${clip.hesitations === null ? 'not counted yet' : `${clip.hesitations} hesitations`}.`, '');
  lines.push('| Setup | Hesitations found | Spellings returned | Other fillers found | Long pauses | Restarts | Words per minute | Word mistakes | Turnaround |', '|---|---|---|---|---|---|---|---|---|');
  for (const setup of setups) {
    const r = runs.find((x) => x.clip === short && x.setup === setup.id)!;
    if (r.error) {
      lines.push(`| ${setup.label} | failed: ${r.error} | | | | | | | |`);
      continue;
    }
    const { um = 0, uh = 0, ...others } = r.fillersFound ?? {};
    lines.push(
      `| ${setup.label} | ${um + uh}${clip.hesitations === null ? '' : ` of ${clip.hesitations}`} | ${spelled(r.spellings)} | ${spelled(others)} | ${of(r.pauses, clip.pauses)} | ${of(r.restarts, clip.restarts)} | ${r.wordsPerMinute ?? 'n/a'} | ${typeof r.wer === 'number' ? `${(r.wer * 100).toFixed(1)}%` : 'n/a'} | ${r.turnaroundSeconds?.toFixed(1)} s |`,
    );
  }
  lines.push('');
}

await Deno.mkdir('results', { recursive: true });
await Deno.writeTextFile('results/transcribers.md', lines.join('\n'));
await Deno.writeTextFile('results/transcribers.json', JSON.stringify({ date: new Date().toISOString(), runs }, null, 2));
console.log('\nWrote results/transcribers.md and results/transcribers.json');
