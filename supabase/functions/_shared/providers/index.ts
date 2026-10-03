import { elevenLabsModel, elevenLabsTranscriber } from './elevenlabs.ts';

// The one line that decides which voice-to-text provider the pipeline uses.
// ElevenLabs Scribe v2 won the comparison in evals/results/transcribers.md: it caught every um and uh.
const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set. Run `npx supabase secrets set ELEVENLABS_API_KEY=...`.');

export const transcriber = elevenLabsTranscriber(apiKey);
export const transcriberVersion = `elevenlabs/${elevenLabsModel}`;
