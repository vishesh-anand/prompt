import type { z } from 'npm:zod@4';

// A prompt lives in its own file in _shared/prompts/ with a version number. Bump it on every change.
export type PromptFile = { readonly name: string; readonly version: number; readonly text: string };

// Every AI stage talks to a language model through this and nothing else. The output has already been
// checked against `schema` when it comes back; if the model's answer doesn't fit, this throws.
export interface Model {
  generate<T>(args: { prompt: PromptFile; input: unknown; schema: z.ZodType<T> }): Promise<T>;
}
