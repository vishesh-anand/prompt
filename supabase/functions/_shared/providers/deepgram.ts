import { z } from 'npm:zod@4';

import type { Transcript } from '../schemas/metrics.ts';
import type { Transcriber } from './transcriber.ts';

// filler_words keeps um and uh; punctuate gives "So," so Measure can tell where sentences start.
// nova-2 is the model the pipeline uses: nova-3 dropped every um and uh on a real recording.
export const deepgramModel = 'nova-2';

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

type Options = { model?: string; fetchImpl?: typeof fetch };

export function deepgramTranscriber(apiKey: string, { model = deepgramModel, fetchImpl = fetch }: Options = {}): Transcriber {
  const url = `https://api.deepgram.com/v1/listen?model=${model}&language=en-IN&filler_words=true&punctuate=true`;
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
