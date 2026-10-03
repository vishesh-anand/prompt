import { deepgramModel, deepgramTranscriber } from './deepgram.ts';

// The one line that decides which voice-to-text provider the pipeline uses.
const apiKey = Deno.env.get('DEEPGRAM_API_KEY');
if (!apiKey) throw new Error('DEEPGRAM_API_KEY is not set. Run `npx supabase secrets set DEEPGRAM_API_KEY=...`.');

export const transcriber = deepgramTranscriber(apiKey);
export const transcriberVersion = `deepgram/${deepgramModel}`;
