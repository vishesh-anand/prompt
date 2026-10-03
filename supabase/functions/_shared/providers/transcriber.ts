import type { Transcript } from '../schemas/metrics.ts';

// Every pipeline stage talks to voice-to-text through this and nothing else.
// Must keep filler words (um, uh) and give a start and end time for every word.
export interface Transcriber {
  transcribe(audio: Uint8Array): Promise<Transcript>;
}

// "Um," -> "um". Providers that attach punctuation to each word use this for `text`, and keep the original in `punctuated`.
export function plainWord(punctuated: string): string {
  return punctuated.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^a-z0-9']/g, '');
}
