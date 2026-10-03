import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { elevenLabsTranscriber } from './elevenlabs.ts';

// Trimmed from a real response: seconds, punctuation attached, spacing items between words.
const sample = {
  words: [
    { text: 'So', start: 0.98, end: 1.18, type: 'word' },
    { text: ' ', start: 1.18, end: 1.18, type: 'spacing' },
    { text: 'Um,', start: 5.66, end: 5.9, type: 'word' },
    { text: ' ', start: 5.9, end: 5.95, type: 'spacing' },
    { text: '(laughter)', start: 6, end: 7, type: 'audio_event' },
    { text: 'decision', start: 59.74, end: 60.08, type: 'word' },
  ],
};

const reply = (body: unknown, status = 200) => (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as typeof fetch;

Deno.test('keeps only real words, hesitations included, with seconds and punctuation', async () => {
  const transcript = await elevenLabsTranscriber('key', { fetchImpl: reply(sample) }).transcribe(new Uint8Array());
  assertEquals(transcript.words, [
    { text: 'so', punctuated: 'So', start: 0.98, end: 1.18 },
    { text: 'um', punctuated: 'Um,', start: 5.66, end: 5.9 },
    { text: 'decision', punctuated: 'decision', start: 59.74, end: 60.08 },
  ]);
});

Deno.test('sends the model, word timings, and no sound tags', async () => {
  let form: FormData | undefined;
  let key: string | null = null;
  const fetchImpl = ((_url: string | URL | Request, init?: RequestInit) => {
    form = init?.body as FormData;
    key = new Headers(init?.headers).get('xi-api-key');
    return Promise.resolve(new Response(JSON.stringify(sample)));
  }) as typeof fetch;
  await elevenLabsTranscriber('secret', { fetchImpl }).transcribe(new Uint8Array([1, 2, 3]));
  assertEquals(form?.get('model_id'), 'scribe_v2');
  assertEquals(form?.get('timestamps_granularity'), 'word');
  assertEquals(form?.get('tag_audio_events'), 'false');
  assertEquals(key, 'secret');
});

Deno.test('silence is an empty transcript; a failed request or odd shape throws', async () => {
  assertEquals((await elevenLabsTranscriber('key', { fetchImpl: reply({ words: [] }) }).transcribe(new Uint8Array())).words, []);
  await assertRejects(() => elevenLabsTranscriber('key', { fetchImpl: reply({}, 401) }).transcribe(new Uint8Array()));
  await assertRejects(() => elevenLabsTranscriber('key', { fetchImpl: reply({ nope: true }) }).transcribe(new Uint8Array()));
});
