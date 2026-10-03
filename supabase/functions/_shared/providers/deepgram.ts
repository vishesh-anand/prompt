import { z } from 'npm:zod@4';

import type { Transcript } from '../schemas/metrics.ts';
import type { Transcriber } from './transcriber.ts';

// Provisional provider until the comparison in /evals (build step 4, part B).
// filler_words keeps um and uh; punctuate gives "So," so Measure can tell where sentences start.
export const deepgramModel = 'nova-2';
const url = `https://api.deepgram.com/v1/listen?model=${deepgramModel}&language=en-IN&filler_words=true&punctuate=true`;

const responseSchema = z.object({
  results: z.object({
    channels: z
      .array(
        z.object({
          alternatives: z.array(
            z.object({
              words: z.array(
                z.object({
                  word: z.string(),
                  punctuated_word: z.string().optional(),
                  start: z.number(),
                  end: z.number(),
                }),
              ),
            }),
          ),
        }),
      )
      .min(1),
  }),
});

export function deepgramTranscriber(apiKey: string, fetchImpl: typeof fetch = fetch): Transcriber {
  return {
    async transcribe(audio) {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'audio/mp4' },
        body: audio,
      });
      if (!response.ok) throw new Error(`Deepgram answered ${response.status}`);

      const parsed = responseSchema.parse(await response.json());
      // Silence comes back as no alternatives or no words, which is a valid, empty transcript.
      const words = parsed.results.channels[0].alternatives[0]?.words ?? [];
      return {
        words: words.map((w) => ({ text: w.word, punctuated: w.punctuated_word ?? w.word, start: w.start, end: w.end })),
      } satisfies Transcript;
    },
  };
}
