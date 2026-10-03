import { z } from 'npm:zod@4';

import type { Transcript } from '../schemas/metrics.ts';
import { plainWord, type Transcriber } from './transcriber.ts';

// Scribe keeps um and uh unless no_verbatim is set, and returns them as normal words. Words come back with
// punctuation attached ("Um,"), times in seconds, and a "spacing" item between each pair of words.
// tag_audio_events is off so sounds like (laughter) never show up as words.
export const elevenLabsModel = 'scribe_v2';
const url = 'https://api.elevenlabs.io/v1/speech-to-text';

const responseSchema = z.object({
  words: z.array(z.object({ text: z.string(), type: z.string(), start: z.number().nullish(), end: z.number().nullish() })),
});

type Options = { model?: string; fetchImpl?: typeof fetch };

export function elevenLabsTranscriber(apiKey: string, { model = elevenLabsModel, fetchImpl = fetch }: Options = {}): Transcriber {
  return {
    async transcribe(audio) {
      const form = new FormData();
      form.set('model_id', model);
      form.set('language_code', 'en');
      form.set('timestamps_granularity', 'word');
      form.set('tag_audio_events', 'false');
      form.set('file', new Blob([new Uint8Array(audio)], { type: 'audio/mp4' }), 'answer.m4a');

      const response = await fetchImpl(url, { method: 'POST', headers: { 'xi-api-key': apiKey }, body: form });
      if (!response.ok) throw new Error(`ElevenLabs answered ${response.status}`);

      const parsed = responseSchema.parse(await response.json());
      const words = parsed.words.flatMap((w) =>
        w.type === 'word' && typeof w.start === 'number' && typeof w.end === 'number'
          ? [{ text: plainWord(w.text), punctuated: w.text, start: w.start, end: w.end }]
          : [],
      );
      return { words } satisfies Transcript;
    },
  };
}
