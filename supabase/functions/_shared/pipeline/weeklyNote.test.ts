import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import type { Model, PromptFile } from '../providers/model.ts';
import type { WeeklyFacts } from '../weeklyFacts.ts';
import { weeklyNoteMaxChars, writeWeeklyNote } from './weeklyNote.ts';

const facts: WeeklyFacts = {
  weekStart: '2026-10-05',
  practiceDays: 3,
  scoredDays: 3,
  days: [{ day: '2026-10-05', fillersPerMinute: 9, wordsPerMinute: 150, clearPoint: 3 }],
  average: { fillersPerMinute: 9, wordsPerMinute: 150, clearPoint: 3 },
  start: null,
};

function modelThatSays(...replies: unknown[]) {
  const seen: { prompt: PromptFile; input: unknown }[] = [];
  const model: Model = {
    generate<T>(args: { prompt: PromptFile; input: unknown }) {
      seen.push({ prompt: args.prompt, input: args.input });
      const reply = replies[Math.min(seen.length - 1, replies.length - 1)];
      return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply as T);
    },
  };
  return { model, seen };
}

Deno.test('the model gets the counted numbers and the notebook, and nothing else', async () => {
  const { model, seen } = modelThatSays({ text: 'Your filler words fell from 9 to 5 a minute. Say your point first.' });
  const note = await writeWeeklyNote({ facts, notebook: 'Says um a lot.' }, model);
  assertEquals(note, 'Your filler words fell from 9 to 5 a minute. Say your point first.');
  assertEquals(seen.length, 1);
  assertEquals(seen[0]?.input, { week: facts, notebook: 'Says um a lot.' });
  assertEquals(seen[0]?.prompt.name, 'weeklyNote');
});

Deno.test('an empty reply is asked for again, once', async () => {
  const { model, seen } = modelThatSays({ text: '   ' }, { text: 'Say your point first.' });
  assertEquals(await writeWeeklyNote({ facts, notebook: '' }, model), 'Say your point first.');
  assertEquals(seen.length, 2);
});

Deno.test('a reply over the limit is asked for again, then the stage gives up', async () => {
  const { model, seen } = modelThatSays({ text: 'x'.repeat(weeklyNoteMaxChars + 1) });
  await assertRejects(() => writeWeeklyNote({ facts, notebook: '' }, model), Error, 'more than');
  assertEquals(seen.length, 2);
});

Deno.test('a model error is tried again once, then thrown', async () => {
  const { model, seen } = modelThatSays(new Error('overloaded'));
  await assertRejects(() => writeWeeklyNote({ facts, notebook: '' }, model), Error, 'overloaded');
  assertEquals(seen.length, 2);
});
