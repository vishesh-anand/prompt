import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { deepgramTranscriber } from './deepgram.ts';

const sample = {
  results: {
    channels: [
      {
        alternatives: [
          {
            transcript: 'So, um I think',
            words: [
              { word: 'so', punctuated_word: 'So,', start: 0.1, end: 0.4, confidence: 0.99 },
              { word: 'um', punctuated_word: 'um', start: 0.6, end: 0.9, confidence: 0.9 },
              { word: 'i', start: 1.0, end: 1.1, confidence: 0.99 },
            ],
          },
        ],
      },
    ],
  },
};

const reply = (body: unknown, status = 200) => (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as typeof fetch;

Deno.test('maps a Deepgram response to a transcript, keeping fillers and timings', async () => {
  const transcript = await deepgramTranscriber('key', { fetchImpl: reply(sample) }).transcribe(new Uint8Array());
  assertEquals(transcript.words, [
    { text: 'so', punctuated: 'So,', start: 0.1, end: 0.4 },
    { text: 'um', punctuated: 'um', start: 0.6, end: 0.9 },
    { text: 'i', punctuated: 'i', start: 1.0, end: 1.1 },
  ]);
});

Deno.test('asks for the model it was given', async () => {
  let asked = '';
  const fetchImpl = ((input: string | URL | Request) => {
    asked = String(input);
    return Promise.resolve(new Response(JSON.stringify(sample)));
  }) as typeof fetch;
  await deepgramTranscriber('key', { model: 'nova-3', fetchImpl }).transcribe(new Uint8Array());
  assertEquals(new URL(asked).searchParams.get('model'), 'nova-3');
});

Deno.test('silence is an empty transcript, not an error', async () => {
  const silent = { results: { channels: [{ alternatives: [{ transcript: '', words: [] }] }] } };
  assertEquals((await deepgramTranscriber('key', { fetchImpl: reply(silent) }).transcribe(new Uint8Array())).words, []);
});

Deno.test('a failed request or an unexpected shape throws', async () => {
  await assertRejects(() => deepgramTranscriber('key', { fetchImpl: reply({}, 401) }).transcribe(new Uint8Array()));
  await assertRejects(() => deepgramTranscriber('key', { fetchImpl: reply({ nope: true }) }).transcribe(new Uint8Array()));
});
