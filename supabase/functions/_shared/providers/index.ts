import { anthropicModel, type Usage } from './anthropic.ts';
import { elevenLabsModel, elevenLabsTranscriber } from './elevenlabs.ts';

// The lines that decide which providers the pipeline uses.
// ElevenLabs Scribe v2 won the comparison in evals/results/transcribers.md: it caught every um and uh.
const elevenLabsKey = Deno.env.get('ELEVENLABS_API_KEY');
if (!elevenLabsKey) throw new Error('ELEVENLABS_API_KEY is not set. Run `npx supabase secrets set ELEVENLABS_API_KEY=...`.');

export const transcriber = elevenLabsTranscriber(elevenLabsKey);
export const transcriberVersion = `elevenlabs/${elevenLabsModel}`;

// Claude Sonnet 5.5 for the judge, coach and notebook. It matched the owner's scores about as well as Sonnet 5 on
// evals/results/judge.md, is faster, and is the current Sonnet. A new model is one line here, then rerun the evals.
const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY is not set. Run `npx supabase secrets set ANTHROPIC_API_KEY=...`.');

export const modelName = 'claude-sonnet-5-5';
export const makeModel = (onUsage: (usage: Usage) => void) => anthropicModel(anthropicKey, { model: modelName, onUsage });
