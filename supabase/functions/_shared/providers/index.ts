import { elevenLabsModel, elevenLabsTranscriber } from './elevenlabs.ts';

// The lines that decide which providers the pipeline uses.
// ElevenLabs Scribe v2 won the comparison in evals/results/transcribers.md: it caught every um and uh.
const elevenLabsKey = Deno.env.get('ELEVENLABS_API_KEY');
if (!elevenLabsKey) throw new Error('ELEVENLABS_API_KEY is not set. Run `npx supabase secrets set ELEVENLABS_API_KEY=...`.');

export const transcriber = elevenLabsTranscriber(elevenLabsKey);
export const transcriberVersion = `elevenlabs/${elevenLabsModel}`;

// The model lives in claude.ts. Functions that only write with Claude import it from there.
export { makeModel, modelName } from './claude.ts';
