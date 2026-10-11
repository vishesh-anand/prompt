import { anthropicModel, type Usage } from './anthropic.ts';

// Claude Sonnet 5.5 for the judge, coach, notebook and weekly note. It matched the owner's scores about as well as
// Sonnet 5 on evals/results/judge.md, is faster, and is the current Sonnet. A new model is one line here, then rerun the
// evals. Kept apart from the transcriber so a function that only needs Claude (weekly-note) doesn't also need the
// voice-to-text key to start.
const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY is not set. Run `npx supabase secrets set ANTHROPIC_API_KEY=...`.');

export const modelName = 'claude-sonnet-5-5';
export const makeModel = (onUsage: (usage: Usage) => void, limits: { timeoutMs?: number; maxRetries?: number; deadlineMs?: number } = {}) =>
  anthropicModel(anthropicKey, { model: modelName, onUsage, ...limits });
