import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { assemblyAiTranscriber } from './assemblyai.ts';

// Trimmed from a real response: times are milliseconds, punctuation is attached.
const words = [
  { text: 'So', start: 1120, end: 1360 },
  { text: 'Um,', start: 5600, end: 5900 },
  { text: 'decision.', start: 59720, end: 60000 },
];

// A fake AssemblyAI that answers each call in turn. `polls` is what GET /v2/transcript/<id> returns, in order.
function fake(polls: unknown[]) {
  const seen: { method: string; path: string; body?: string }[] = [];
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const method = init?.method ?? 'GET';
    seen.push({ method, path, body: typeof init?.body === 'string' ? init.body : undefined });
    const reply = path === '/v2/upload' ? { upload_url: 'https://cdn/x' } : method === 'POST' ? { id: 't1' } : polls.shift();
    return Promise.resolve(new Response(JSON.stringify(reply)));
  }) as typeof fetch;
  return { fetchImpl, seen };
}

Deno.test('maps words to seconds and keeps the punctuated form', async () => {
  const { fetchImpl } = fake([{ status: 'completed', words }]);
  const transcript = await assemblyAiTranscriber('key', { fetchImpl, pollMs: 0 }).transcribe(new Uint8Array());
  assertEquals(transcript.words, [
    { text: 'so', punctuated: 'So', start: 1.12, end: 1.36 },
    { text: 'um', punctuated: 'Um,', start: 5.6, end: 5.9 },
    { text: 'decision', punctuated: 'decision.', start: 59.72, end: 60 },
  ]);
});

Deno.test('keeps checking while the job is queued or processing', async () => {
  const { fetchImpl, seen } = fake([{ status: 'queued' }, { status: 'processing' }, { status: 'completed', words }]);
  const transcript = await assemblyAiTranscriber('key', { fetchImpl, pollMs: 0 }).transcribe(new Uint8Array());
  assertEquals(transcript.words.length, 3);
  assertEquals(seen.filter((c) => c.method === 'GET').length, 3);
});

Deno.test('asks for one model, with fillers kept', async () => {
  const { fetchImpl, seen } = fake([{ status: 'completed', words }]);
  await assemblyAiTranscriber('key', { model: 'universal-3-5-pro', fetchImpl, pollMs: 0 }).transcribe(new Uint8Array());
  const body = JSON.parse(seen.find((c) => c.path === '/v2/transcript' && c.method === 'POST')!.body!);
  assertEquals(body.speech_models, ['universal-3-5-pro']);
  assertEquals(body.disfluencies, true);
});

Deno.test('silence is an empty transcript, not an error', async () => {
  const { fetchImpl } = fake([{ status: 'completed', words: null }]);
  assertEquals((await assemblyAiTranscriber('key', { fetchImpl, pollMs: 0 }).transcribe(new Uint8Array())).words, []);
});

Deno.test('a failed job, a stuck job and a bad request all throw', async () => {
  const failed = fake([{ status: 'error', error: 'bad audio' }]);
  await assertRejects(() => assemblyAiTranscriber('key', { fetchImpl: failed.fetchImpl, pollMs: 0 }).transcribe(new Uint8Array()), Error, 'bad audio');

  const stuck = fake(Array(50).fill({ status: 'processing' }));
  await assertRejects(() => assemblyAiTranscriber('key', { fetchImpl: stuck.fetchImpl, pollMs: 0, timeoutMs: 0 }).transcribe(new Uint8Array()), Error, 'too long');

  const rejected = (() => Promise.resolve(new Response('{}', { status: 401 }))) as typeof fetch;
  await assertRejects(() => assemblyAiTranscriber('key', { fetchImpl: rejected }).transcribe(new Uint8Array()));
});
