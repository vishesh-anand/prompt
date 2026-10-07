import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import type Anthropic from 'npm:@anthropic-ai/sdk';
import { z } from 'npm:zod@4';

import { anthropicModel, type Usage } from './anthropic.ts';

const schema = z.object({ answer: z.string() });
const prompt = { name: 'test', version: 1, text: 'You answer questions.' };

type Params = Record<string, unknown>;

// A stand-in for the Anthropic client that records the request and returns a canned reply.
function fakeClient(reply: Record<string, unknown>, seen: Params[] = []) {
  const messages = {
    parse: (params: Params) => {
      seen.push(params);
      return Promise.resolve({ usage: { input_tokens: 120, output_tokens: 40 }, stop_reason: 'end_turn', parsed_output: { answer: 'hi' }, ...reply });
    },
  };
  return { messages } as unknown as Pick<Anthropic, 'messages'>;
}

Deno.test('sends the prompt as the system text, the input as JSON, and the effort', async () => {
  const seen: Params[] = [];
  const model = anthropicModel('key', { model: 'claude-sonnet-5-5', effort: 'low', client: fakeClient({}, seen) });
  assertEquals(await model.generate({ prompt, input: { question: 'Why?' }, schema }), { answer: 'hi' });
  assertEquals(seen[0].model, 'claude-sonnet-5-5');
  assertEquals(seen[0].system, 'You answer questions.');
  assertEquals(seen[0].messages, [{ role: 'user', content: '{\n  "question": "Why?"\n}' }]);
  assertEquals((seen[0].output_config as { effort: string }).effort, 'low');
  assertEquals('temperature' in seen[0], false);
});

Deno.test('reports token usage for every call', async () => {
  const usages: Usage[] = [];
  const model = anthropicModel('key', { model: 'claude-sonnet-5', onUsage: (u) => usages.push(u), client: fakeClient({}) });
  await model.generate({ prompt, input: 'x', schema });
  assertEquals(usages, [{ model: 'claude-sonnet-5', inputTokens: 120, outputTokens: 40 }]);
});

Deno.test('throws instead of returning half an answer', async () => {
  const generate = (reply: Record<string, unknown>) => anthropicModel('key', { model: 'm', client: fakeClient(reply) }).generate({ prompt, input: 'x', schema });
  await assertRejects(() => generate({ stop_reason: 'refusal' }), Error, 'declined');
  await assertRejects(() => generate({ stop_reason: 'max_tokens' }), Error, 'ran out of room');
  await assertRejects(() => generate({ parsed_output: null }), Error, 'expected shape');
});
