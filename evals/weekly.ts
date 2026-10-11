import { writeWeeklyNote, weeklyNoteMaxChars } from '../supabase/functions/_shared/pipeline/weeklyNote.ts';
import { weeklyNotePrompt } from '../supabase/functions/_shared/prompts/weeklyNote.ts';
import { anthropicModel, type Usage } from '../supabase/functions/_shared/providers/anthropic.ts';
import type { WeeklyFacts } from '../supabase/functions/_shared/weeklyFacts.ts';

// Run from this folder with `npm run evals:weekly`. Runs the real weekly note stage on the hand-made weeks in weeks.json,
// twice each, and checks what can be checked by plain code:
//  - every number in the note comes from the numbers it was given (or is a date or a day count),
//  - no praise words and no exclamation marks, at most 3 sentences and 400 characters,
//  - a week where nothing improved never claims an improvement, and a week that improved says so,
//  - it ends with a next step (a plain-code guess: "next time", or a sentence that starts with a verb),
//  - cost per note.
// It does not use a second model to check tone: read the notes in out/weekly-examples.md. Notes stay in the git-ignored out/.

type Week = { name: string; improves: boolean | null; notebook: string; facts: WeeklyFacts };

const runsPerWeek = 2;
const model = { model: 'claude-sonnet-5-5', inputPrice: 2, outputPrice: 10 };
const bannedPraise = ['great job', 'amazing', 'awesome', 'well done', 'fantastic', 'excellent', 'keep it up', 'congrat'];

const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set. Add it to evals/.env (git-ignored), then run again.');

const weeks: Week[] = JSON.parse(await Deno.readTextFile('weeks.json'));
const tokens = { in: 0, out: 0 };
const client = anthropicModel(apiKey, { model: model.model, onUsage: (u: Usage) => { tokens.in += u.inputTokens; tokens.out += u.outputTokens; } });

const sentences = (text: string) => text.split(/(?<=[.?!])\s+/).filter((s) => s.trim() !== '');

function allowedNumbers(f: WeeklyFacts): Set<number> {
  const set = new Set<number>([f.practiceDays, f.scoredDays]);
  const add = (n: number | null | undefined) => n !== null && n !== undefined && set.add(n);
  for (const d of f.days) {
    add(d.fillersPerMinute); add(d.wordsPerMinute); add(d.clearPoint);
    set.add(Number(d.day.slice(8))); // "October 7"
  }
  for (const o of [f.average, f.start]) if (o) { add(o.fillersPerMinute); add(o.wordsPerMinute); add(o.clearPoint); }
  set.add(6); // "out of 6"
  set.add(110); // the good-speed range, 110 to 170, which the prompt itself gives
  set.add(170);
  set.add(3); // "three days"
  return set;
}

function problems(week: Week, text: string): string[] {
  const out: string[] = [];
  const lower = text.toLowerCase();
  if (text.length > weeklyNoteMaxChars) out.push(`${text.length} characters`);
  if (sentences(text).length > 3) out.push(`${sentences(text).length} sentences`);
  if (text.includes('!')) out.push('exclamation mark');
  for (const w of bannedPraise) if (lower.includes(w)) out.push(`praise: ${w}`);
  const allowed = allowedNumbers(week.facts);
  for (const m of text.matchAll(/\d+(?:\.\d+)?/g)) if (!allowed.has(Number(m[0]))) out.push(`number not in the facts: ${m[0]}`);
  // Improvement claims: a positive word in a sentence with no "nothing", "no", "not" or "didn't".
  const positive = /\b(improv\w*|better|fell|dropped|cut|fewer|down from|dipped|progress|gain\w*|rose in)\b/;
  const negated = /\b(nothing|no|not|didn't|did not|hasn't|without|worse|but)\b/;
  const claims = sentences(lower).some((s) => positive.test(s) && !negated.test(s));
  if (week.improves === false && claims) out.push('claims an improvement when nothing improved');
  if (week.improves === true && !positive.test(lower)) out.push('does not say what improved');
  const last = sentences(lower).at(-1) ?? '';
  if (!/^next\b|next time|^(try|say|start|open|pause|keep|aim|slow|speed|give|use|lead|answer|finish|end|put|name|add|choose|take|count|record|practice|begin|state|lead|cut)\b/.test(last)) out.push('last sentence is not a next step');
  return out;
}

const rows: { name: string; runs: { text: string; problems: string[] }[] }[] = [];
const examples: string[] = ['# Weekly note examples (git-ignored)', ''];
for (const week of weeks) {
  const runs: { text: string; problems: string[] }[] = [];
  for (let i = 0; i < runsPerWeek; i++) {
    try {
      const text = await writeWeeklyNote({ facts: week.facts, notebook: week.notebook }, client);
      runs.push({ text, problems: problems(week, text) });
    } catch (error) {
      runs.push({ text: '', problems: [`stage failed: ${(error as Error).message}`] });
    }
  }
  rows.push({ name: week.name, runs });
  examples.push(`## ${week.name}`, '', ...runs.map((r, i) => `${i + 1}. ${r.text || '(no note)'}${r.problems.length ? `\n   - PROBLEMS: ${r.problems.join('; ')}` : ''}`), '');
  console.log(`${week.name}: ${runs.map((r) => (r.problems.length === 0 ? 'ok' : 'PROBLEM')).join(', ')}`);
}

const total = rows.length * runsPerWeek;
const clean = rows.reduce((n, r) => n + r.runs.filter((x) => x.problems.length === 0).length, 0);
const cost = ((tokens.in * model.inputPrice + tokens.out * model.outputPrice) / 1_000_000) / total;
const lines = [
  '# Weekly note eval',
  '',
  `Generated by \`npm run evals:weekly\` on ${new Date().toISOString().slice(0, 10)}. Prompt version ${weeklyNotePrompt.version}, ${model.model}. Full notes stay in the git-ignored \`out/weekly-examples.md\`.`,
  '',
  `**${clean} of ${total} notes passed every plain-code check** (${weeks.length} weeks, ${runsPerWeek} runs each). Cost per note: $${cost.toFixed(4)}.`,
  '',
  'Checks: numbers come from the facts, no praise or exclamation marks, at most 3 sentences and 400 characters, no improvement claimed when nothing improved, says what improved when something did, ends with a next step. Tone is not machine-checked: read the examples.',
  '',
  '| Week | Run 1 | Run 2 |',
  '|---|---|---|',
  ...rows.map((r) => `| ${r.name} | ${r.runs.map((x) => (x.problems.length === 0 ? 'ok' : x.problems.join('; '))).join(' | ')} |`),
  '',
];
await Deno.mkdir('out', { recursive: true });
await Deno.writeTextFile('results/weekly.md', lines.join('\n'));
await Deno.writeTextFile('out/weekly-examples.md', examples.join('\n'));
console.log(`\n${clean} of ${total} clean. Cost per note $${cost.toFixed(4)}. Wrote results/weekly.md`);
