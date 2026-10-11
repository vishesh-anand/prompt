import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@0.131.0/helpers/zod';

import type { Model } from './model.ts';

// Claude models behind the Model interface. The reply is forced into the schema's shape by the API
// (structured outputs) and then checked against the Zod schema here, so a stage never sees a bad shape.
//
// These models reject `temperature` and forced tool use, so repeatability is tuned with `effort`
// (how much the model thinks) instead. Thinking itself stays on its default.
export type Effort = 'low' | 'medium' | 'high';

export type Usage = { model: string; inputTokens: number; outputTokens: number };

type Options = {
  model: string;
  effort?: Effort;
  onUsage?: (usage: Usage) => void;
  client?: Pick<Anthropic, 'messages'>;
  // For the client built here (ignored when a client is passed). The SDK defaults are a 10-minute timeout and 2 retries.
  timeoutMs?: number;
  maxRetries?: number;
  // One limit for the whole call, body included. The SDK's own timeout stops counting once the reply's headers arrive.
  deadlineMs?: number;
};

// Room for the thinking as well as the answer: thinking tokens count toward this limit.
const maxTokens = 16000;

export function anthropicModel(apiKey: string, { model, effort = 'medium', onUsage, timeoutMs, maxRetries, deadlineMs, client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries }) }: Options): Model {
  return {
    async generate({ prompt, input, schema }) {
      const response = await client.messages.parse({
        model,
        max_tokens: maxTokens,
        system: prompt.text,
        messages: [{ role: 'user', content: JSON.stringify(input, null, 2) }],
        output_config: { effort, format: zodOutputFormat(schema) },
      }, deadlineMs === undefined ? undefined : { signal: AbortSignal.timeout(deadlineMs) });
      onUsage?.({ model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens });

      if (response.stop_reason === 'refusal') throw new Error(`${model} declined to answer`);
      if (response.stop_reason === 'max_tokens') throw new Error(`${model} ran out of room before finishing`);
      if (response.parsed_output === null || response.parsed_output === undefined) throw new Error(`${model} did not return the expected shape`);
      return response.parsed_output;
    },
  };
}
