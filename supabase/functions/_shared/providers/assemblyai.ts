import { z } from 'npm:zod@4';

import type { Transcript } from '../schemas/metrics.ts';
import { plainWord, type Transcriber } from './transcriber.ts';

// disfluencies keeps um and uh (AssemblyAI removes them by default). Words come back with
// punctuation attached ("Um,") and times in milliseconds.
const base = 'https://api.assemblyai.com';

const uploadSchema = z.object({ upload_url: z.string() });
const createdSchema = z.object({ id: z.string() });
const transcriptResponseSchema = z.object({
  status: z.string(),
  error: z.string().nullish(),
  words: z.array(z.object({ text: z.string(), start: z.number(), end: z.number() })).nullish(),
});

type Options = {
  model?: 'universal-2' | 'universal-3-5-pro';
  fetchImpl?: typeof fetch;
  pollMs?: number;
  timeoutMs?: number;
};

export function assemblyAiTranscriber(
  apiKey: string,
  { model = 'universal-2', fetchImpl = fetch, pollMs = 1000, timeoutMs = 120_000 }: Options = {},
): Transcriber {
  async function call(method: string, path: string, init: { body?: BodyInit; contentType: string }) {
    const response = await fetchImpl(base + path, { method, headers: { authorization: apiKey, 'content-type': init.contentType }, body: init.body });
    if (!response.ok) throw new Error(`AssemblyAI answered ${response.status}`);
    return response.json();
  }

  return {
    async transcribe(audio) {
      const { upload_url } = uploadSchema.parse(await call('POST', '/v2/upload', { body: new Uint8Array(audio), contentType: 'application/octet-stream' }));
      // speech_models is a list in fallback order; one entry tests exactly one model.
      const { id } = createdSchema.parse(
        await call('POST', '/v2/transcript', {
          contentType: 'application/json',
          body: JSON.stringify({ audio_url: upload_url, speech_models: [model], disfluencies: true, punctuate: true, language_code: 'en' }),
        }),
      );

      const deadline = Date.now() + timeoutMs;
      while (true) {
        const result = transcriptResponseSchema.parse(await call('GET', `/v2/transcript/${id}`, { contentType: 'application/json' }));
        if (result.status === 'error') throw new Error(`AssemblyAI could not transcribe: ${result.error ?? 'unknown error'}`);
        if (result.status === 'completed') {
          return {
            words: (result.words ?? []).map((w) => ({ text: plainWord(w.text), punctuated: w.text, start: w.start / 1000, end: w.end / 1000 })),
          } satisfies Transcript;
        }
        if (Date.now() > deadline) throw new Error('AssemblyAI took too long');
        await new Promise((resolve) => setTimeout(resolve, pollMs));
      }
    },
  };
}
