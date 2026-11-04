import { assert, assertEquals } from 'jsr:@std/assert@1';

// The question bank (content/questions.json) and the migration that loads it must say the same thing.
const bank: { category: string; text: string; wantsDirectAnswer: boolean }[] = JSON.parse(
  Deno.readTextFileSync(new URL('../../../content/questions.json', import.meta.url)),
);
const migration = Deno.readTextFileSync(new URL('../../migrations/20261011000002_questions.sql', import.meta.url));
// Step D sets which questions want a direct answer.
const directMigration = Deno.readTextFileSync(new URL('../../migrations/20261104000000_step_d.sql', import.meta.url));

Deno.test('50 work and 50 everyday questions', () => {
  assertEquals(bank.filter((q) => q.category === 'work').length, 50);
  assertEquals(bank.filter((q) => q.category === 'everyday').length, 50);
  assertEquals(bank.length, 100);
});

Deno.test('every question is a real sentence, none repeated', () => {
  const seen = new Set<string>();
  for (const { category, text } of bank) {
    assert(category === 'work' || category === 'everyday', `unknown category ${category}`);
    assert(text.trim() === text && text.length >= 20 && text.length <= 160, `odd length or spacing: ${text}`);
    assert(/[.?]$/.test(text), `should end with a full stop or question mark: ${text}`);
    assert(!text.includes('!'), `no exclamation marks in questions: ${text}`);
    const key = text.toLowerCase();
    assert(!seen.has(key), `repeated: ${text}`);
    seen.add(key);
  }
});

Deno.test('the migration inserts exactly the bank, in the same order', () => {
  const inserted = [...migration.matchAll(/^\s+\('(work|everyday)', '((?:[^']|'')*)'\),?;?$/gm)].map((m) => ({
    category: m[1],
    text: m[2].replaceAll("''", "'"),
  }));
  assertEquals(inserted, bank.map(({ category, text }) => ({ category, text })));
});

Deno.test('every question says whether it wants a direct answer, and step D sets exactly those', () => {
  for (const q of bank) assert(typeof q.wantsDirectAnswer === 'boolean', `no wantsDirectAnswer: ${q.text}`);
  const set = [...directMigration.matchAll(/^\s+\('((?:[^']|'')*)'\),?$/gm)].map((m) => m[1].replaceAll("''", "'"));
  assertEquals(set, bank.filter((q) => q.wantsDirectAnswer).map((q) => q.text));
});

Deno.test('the migration turns the old questions off before adding the new ones', () => {
  assert(migration.indexOf('set active = false') < migration.indexOf('insert into public.questions'));
});
