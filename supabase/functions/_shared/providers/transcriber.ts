import type { Transcript } from '../schemas/metrics.ts';

// Every pipeline stage talks to voice-to-text through this and nothing else.
// Must keep filler words (um, uh) and give a start and end time for every word.
export interface Transcriber {
  transcribe(audio: Uint8Array): Promise<Transcript>;
}
