import type { Transcriber } from '../providers/transcriber.ts';
import { type Transcript, transcriptSchema } from '../schemas/metrics.ts';

// Stage 1: Transcribe. Audio in, words with timings out.
export async function transcribe({ audio }: { audio: Uint8Array }, transcriber: Transcriber): Promise<Transcript> {
  return transcriptSchema.parse(await transcriber.transcribe(audio));
}
