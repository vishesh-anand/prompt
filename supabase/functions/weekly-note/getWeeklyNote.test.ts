import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import type { Model, PromptFile } from '../_shared/providers/model.ts';
import type { AnswerRow } from '../_shared/weeklyFacts.ts';
import { claimSeconds, daysNeeded, getWeeklyNote, maxAttemptsPerWeek, modelRetries, type SavedNote, type Store, worstCaseModelMs } from './getWeeklyNote.ts';

const mark = { score: 1, quotes: ['x'], why: 'x' };
const answer = (iso: string, o: { retry?: boolean } = {}): AnswerRow => ({
  created_at: iso,
  retry_of: o.retry ? 'first' : null,
  duration_ms: 30_000,
  metrics: {
    wordCount: 80,
    fillers: { total: 4, byWord: {} },
    pace: { wordsPerMinute: 140, band: 'good' },
    pauses: { count: 0, longestMs: 0, atSeconds: [] },
    restarts: { count: 0, atSeconds: [] },
  },
  judgement: { mainPoint: mark, reasonOrExample: mark, ending: mark, mainPointAtSeconds: 2 },
});

// Monday, Tuesday and Wednesday of the New York week of Oct 5, 2026; Thursday; and a Sunday from the week before.
const mon = answer('2026-10-05T15:00:00Z');
const tue = answer('2026-10-06T15:00:00Z');
const wed = answer('2026-10-07T15:00:00Z');
const thu = answer('2026-10-08T15:00:00Z');
const lastSunday = answer('2026-10-04T15:00:00Z');

function fakeStore(o: { answers: AnswerRow[]; saved?: SavedNote | null; raceTo?: SavedNote; baseline?: AnswerRow | null; alreadyClaimed?: boolean; savedAfterClaim?: SavedNote; attempts?: number; claimAgeSeconds?: number }) {
  const calls = { saves: [] as { daysCovered: number; text: string; weekStart: string }[], savedNoteReads: 0, claims: 0 };
  let saved = o.saved ?? null;
  let claimed = o.alreadyClaimed ?? false;
  const store: Store = {
    // Yields once, so two calls started together both get past the "is a note due?" check before either claims.
    profile: async () => {
      await Promise.resolve();
      return { timezone: 'America/New_York', baselineAnswerId: o.baseline ? 'baseline' : null };
    },
    answersSince: (from) => Promise.resolve(o.answers.filter((a) => Date.parse(a.created_at) >= from.getTime())),
    answer: () => Promise.resolve(o.baseline ?? null),
    notebook: () => Promise.resolve('Says um before the main point.'),
    savedNote: () => {
      calls.savedNoteReads += 1;
      // The second read is the one after winning the claim: another request may have saved a note in between.
      if (calls.savedNoteReads >= 2 && o.savedAfterClaim) return Promise.resolve(o.savedAfterClaim);
      return Promise.resolve(saved);
    },
    claimState: () => Promise.resolve({ attempts: o.attempts ?? 1, ageSeconds: o.claimAgeSeconds ?? 600 }),
    claim: (_week: string, _limits: { minSeconds: number; maxAttempts: number; daysCovered: number }) => {
      calls.claims += 1;
      // Like the database: refused when a saved note already covers the days, and the first caller wins after that.
      const covering = calls.savedNoteReads >= 1 && o.savedAfterClaim ? o.savedAfterClaim : saved;
      if (covering && covering.days_covered >= _limits.daysCovered) return Promise.resolve(false);
      if (claimed) return Promise.resolve(false);
      claimed = true;
      return Promise.resolve(true);
    },
    saveNote: (n) => {
      calls.saves.push({ daysCovered: n.daysCovered, text: n.text, weekStart: n.weekStart });
      saved = o.raceTo ?? { text: n.text, days_covered: n.daysCovered };
      return Promise.resolve(saved);
    },
  };
  return { store, calls };
}

function fakeModel(...replies: (string | Error)[]) {
  const seen: { prompt: PromptFile; input: unknown }[] = [];
  const model: Model = {
    generate<T>(args: { prompt: PromptFile; input: unknown }) {
      seen.push({ prompt: args.prompt, input: args.input });
      const reply = replies[Math.min(seen.length - 1, replies.length - 1)];
      return reply instanceof Error ? Promise.reject(reply) : Promise.resolve({ text: reply } as T);
    },
  };
  return { model, seen };
}

const now = new Date('2026-10-10T19:00:00Z'); // Saturday

Deno.test('two practice days: no note and no model call, and it says how many days there are', async () => {
  const { store, calls } = fakeStore({ answers: [mon, tue] });
  const { model, seen } = fakeModel('unused');
  const reply = await getWeeklyNote({ store, model, modelName: 'm', now });
  assertEquals(reply, { practiceDays: 2, daysNeeded: 3, note: null, writing: false, gaveUp: false });
  assertEquals(seen.length, 0);
  assertEquals(calls.saves.length, 0);
});

Deno.test('retries and a second answer on one day do not make another day', async () => {
  const { store } = fakeStore({ answers: [mon, answer('2026-10-05T18:00:00Z'), answer('2026-10-06T15:00:00Z', { retry: true })] });
  const { model, seen } = fakeModel('unused');
  const reply = await getWeeklyNote({ store, model, modelName: 'm', now });
  assertEquals(reply.practiceDays, 2);
  assertEquals(seen.length, 0);
});

Deno.test('last week\'s answers do not count', async () => {
  const { store } = fakeStore({ answers: [lastSunday, mon, tue] });
  const { model, seen } = fakeModel('unused');
  assertEquals((await getWeeklyNote({ store, model, modelName: 'm', now })).practiceDays, 2);
  assertEquals(seen.length, 0);
});

Deno.test('the third day writes the note once and saves it with the days it covers', async () => {
  const { store, calls } = fakeStore({ answers: [mon, tue, wed] });
  const { model, seen } = fakeModel('Your filler words held at 8 a minute. Say your point first.');
  const reply = await getWeeklyNote({ store, model, modelName: 'sonnet', now });
  assertEquals(reply, { practiceDays: 3, daysNeeded: 3, note: 'Your filler words held at 8 a minute. Say your point first.', writing: false, gaveUp: false });
  assertEquals(seen.length, 1);
  assertEquals(calls.saves, [{ daysCovered: 3, text: 'Your filler words held at 8 a minute. Say your point first.', weekStart: '2026-10-05' }]);
});

Deno.test('opening it again the same day makes no model call and returns the same note', async () => {
  const { store, calls } = fakeStore({ answers: [mon, tue, wed], saved: { text: 'Saved note.', days_covered: 3 } });
  const { model, seen } = fakeModel('unused');
  const reply = await getWeeklyNote({ store, model, modelName: 'm', now });
  assertEquals(reply.note, 'Saved note.');
  assertEquals(seen.length, 0);
  assertEquals(calls.saves.length, 0);
});

Deno.test('a new practice day rewrites the note', async () => {
  const { store, calls } = fakeStore({ answers: [mon, tue, wed, thu], saved: { text: 'Old note.', days_covered: 3 } });
  const { model, seen } = fakeModel('New note.');
  const reply = await getWeeklyNote({ store, model, modelName: 'm', now });
  assertEquals(reply, { practiceDays: 4, daysNeeded: 3, note: 'New note.', writing: false, gaveUp: false });
  assertEquals(seen.length, 1);
  assertEquals(calls.saves[0]?.daysCovered, 4);
});

Deno.test('the starting point goes to the model when it has been scored', async () => {
  const baseline = answer('2026-09-01T15:00:00Z');
  const { store } = fakeStore({ answers: [mon, tue, wed], baseline });
  const { model, seen } = fakeModel('Note.');
  await getWeeklyNote({ store, model, modelName: 'm', now });
  const week = (seen[0]?.input as { week: { start: unknown } }).week;
  assertEquals(week.start, { fillersPerMinute: 8, wordsPerMinute: 140, clearPoint: 3 });
});

Deno.test('if the model fails twice the error is thrown and the saved note is left alone', async () => {
  const { store, calls } = fakeStore({ answers: [mon, tue, wed, thu], saved: { text: 'Old note.', days_covered: 3 } });
  const { model, seen } = fakeModel(new Error('overloaded'));
  await assertRejects(() => getWeeklyNote({ store, model, modelName: 'm', now }), Error, 'overloaded');
  assertEquals(seen.length, 2);
  assertEquals(calls.saves.length, 0);
});

Deno.test('if another call saved a note covering more days meanwhile, that note is returned', async () => {
  const { store } = fakeStore({ answers: [mon, tue, wed], raceTo: { text: 'Newer note.', days_covered: 4 } });
  const { model } = fakeModel('Mine.');
  assertEquals((await getWeeklyNote({ store, model, modelName: 'm', now })).note, 'Newer note.');
});

Deno.test('seven practice days is the most a note can cover', async () => {
  const days = Array.from({ length: 7 }, (_, i) => answer(`2026-10-${String(5 + i).padStart(2, '0')}T15:00:00Z`));
  const { store, calls } = fakeStore({ answers: days });
  const { model } = fakeModel('Full week.');
  await getWeeklyNote({ store, model, modelName: 'm', now: new Date('2026-10-11T19:00:00Z') });
  assertEquals(calls.saves[0]?.daysCovered, 7);
});

const unscored = (iso: string): AnswerRow => ({ ...answer(iso), metrics: null, judgement: null });

Deno.test('a third day that is still being scored makes no note yet, and costs nothing', async () => {
  const { store, calls } = fakeStore({ answers: [mon, tue, unscored('2026-10-07T15:00:00Z')] });
  const { model, seen } = fakeModel('unused');
  const reply = await getWeeklyNote({ store, model, modelName: 'm', now });
  assertEquals(reply, { practiceDays: 3, daysNeeded: 3, note: null, writing: false, gaveUp: false });
  assertEquals(seen.length, 0);
  assertEquals(calls.saves.length, 0);
});

Deno.test('the note is written once the third day has scores, and covers the scored days', async () => {
  const { store, calls } = fakeStore({ answers: [mon, tue, wed] });
  const { model } = fakeModel('Note.');
  await getWeeklyNote({ store, model, modelName: 'm', now });
  assertEquals(calls.saves[0]?.daysCovered, 3);
});

Deno.test('a fourth day still being scored keeps the saved note, and is picked up when it scores', async () => {
  const pending = unscored('2026-10-08T15:00:00Z');
  const first = fakeStore({ answers: [mon, tue, wed, pending], saved: { text: 'Three days.', days_covered: 3 } });
  const m1 = fakeModel('unused');
  const waiting = await getWeeklyNote({ store: first.store, model: m1.model, modelName: 'm', now });
  assertEquals(waiting, { practiceDays: 4, daysNeeded: 3, note: 'Three days.', writing: false, gaveUp: false });
  assertEquals(m1.seen.length, 0);

  const second = fakeStore({ answers: [mon, tue, wed, thu], saved: { text: 'Three days.', days_covered: 3 } });
  const m2 = fakeModel('Four days.');
  const done = await getWeeklyNote({ store: second.store, model: m2.model, modelName: 'm', now });
  assertEquals(done.note, 'Four days.');
  assertEquals(m2.seen.length, 1);
  assertEquals(second.calls.saves[0]?.daysCovered, 4);
});

Deno.test('a third day that is measured but not judged makes no note, and is picked up once judged', async () => {
  const measuredOnly: AnswerRow = { ...answer('2026-10-07T15:00:00Z'), judgement: null };
  const early = fakeStore({ answers: [mon, tue, measuredOnly] });
  const m1 = fakeModel('unused');
  assertEquals((await getWeeklyNote({ store: early.store, model: m1.model, modelName: 'm', now })).note, null);
  assertEquals(m1.seen.length, 0);

  const later = fakeStore({ answers: [mon, tue, wed] });
  const m2 = fakeModel('With clear point.');
  assertEquals((await getWeeklyNote({ store: later.store, model: m2.model, modelName: 'm', now })).note, 'With clear point.');
});

Deno.test('two requests at once make one model call: the other gets the saved note', async () => {
  const { store, calls } = fakeStore({ answers: [mon, tue, wed, thu], saved: { text: 'Old note.', days_covered: 3 } });
  const { model, seen } = fakeModel('New note.');
  const [a, b] = await Promise.all([
    getWeeklyNote({ store, model, modelName: 'm', now }),
    getWeeklyNote({ store, model, modelName: 'm', now }),
  ]);
  assertEquals(seen.length, 1);
  assertEquals(calls.saves.length, 1);
  assertEquals(calls.claims, 2);
  assertEquals([a.note, b.note].sort(), ['New note.', 'Old note.']);
});

Deno.test('ten requests at once still make one model call', async () => {
  const { store } = fakeStore({ answers: [mon, tue, wed] });
  const { model, seen } = fakeModel('Only one.');
  await Promise.all(Array.from({ length: 10 }, () => getWeeklyNote({ store, model, modelName: 'm', now })));
  assertEquals(seen.length, 1);
});

Deno.test('a request that loses the claim and has no saved note gets null, not an error', async () => {
  const { store, calls } = fakeStore({ answers: [mon, tue, wed], alreadyClaimed: true });
  const { model, seen } = fakeModel('unused');
  // Due but not ready: the phone is told a note is on its way, not that answers are being scored.
  assertEquals(await getWeeklyNote({ store, model, modelName: 'm', now }), { practiceDays: 3, daysNeeded: 3, note: null, writing: true, gaveUp: false });
  assertEquals(seen.length, 0);
  assertEquals(calls.saves.length, 0);
});

Deno.test('nothing is claimed when no note is due', async () => {
  const none = fakeStore({ answers: [mon, tue] });
  await getWeeklyNote({ store: none.store, model: fakeModel('x').model, modelName: 'm', now });
  assertEquals(none.calls.claims, 0);
  const saved = fakeStore({ answers: [mon, tue, wed], saved: { text: 'Saved.', days_covered: 3 } });
  await getWeeklyNote({ store: saved.store, model: fakeModel('x').model, modelName: 'm', now });
  assertEquals(saved.calls.claims, 0);
});

Deno.test('if the model fails after winning the claim, the error is thrown and no one else can retry for a minute', async () => {
  const { store, calls } = fakeStore({ answers: [mon, tue, wed] });
  await assertRejects(() => getWeeklyNote({ store, model: fakeModel(new Error('down')).model, modelName: 'm', now }), Error, 'down');
  const { model, seen } = fakeModel('later');
  assertEquals((await getWeeklyNote({ store, model, modelName: 'm', now })).note, null);
  assertEquals(seen.length, 0);
  assertEquals(calls.saves.length, 0);
});

Deno.test('a note saved by another request between the check and the claim is refused by the claim and returned', async () => {
  const { store, calls } = fakeStore({
    answers: [mon, tue, wed, thu],
    saved: { text: 'Old note.', days_covered: 3 },
    savedAfterClaim: { text: 'Written meanwhile.', days_covered: 4 },
  });
  const { model, seen } = fakeModel('Duplicate.');
  const reply = await getWeeklyNote({ store, model, modelName: 'm', now });
  assertEquals(reply.note, 'Written meanwhile.');
  assertEquals(seen.length, 0);
  assertEquals(calls.saves.length, 0);
});

Deno.test('the claim is asked for with the one-per-minute bound', async () => {
  const asked: number[] = [];
  const { store } = fakeStore({ answers: [mon, tue, wed] });
  const withSpy: Store = { ...store, claim: (w, l) => { asked.push(l.minSeconds * 1000 + l.maxAttempts + l.daysCovered / 100); return store.claim(w, l); } };
  await getWeeklyNote({ store: withSpy, model: fakeModel('x').model, modelName: 'm', now });
  assertEquals(asked, [claimSeconds * 1000 + maxAttemptsPerWeek + 0.03]);
});

Deno.test('the worst case for the model finishes with a minute to spare inside the claim', () => {
  // 2 tries x 20 s, and the SDK does not retry on its own (it would sleep for as long as a server's retry-after, unbounded).
  assertEquals(worstCaseModelMs, 40_000);
  assertEquals(worstCaseModelMs + 60_000 <= claimSeconds * 1000, true);
});

Deno.test('the limits fit what the database accepts, and the days needed match the saved-note rule', async () => {
  // claim_weekly_note accepts 10 to 3600 seconds and 1 to 100 attempts.
  assertEquals(claimSeconds >= 10 && claimSeconds <= 3600, true);
  assertEquals(maxAttemptsPerWeek >= 1 && maxAttemptsPerWeek <= 100, true);
  // weekly_notes only accepts days_covered from daysNeeded to 7; below that every save would fail after a paid call.
  const migration = await Deno.readTextFile(new URL('../../migrations/20261012000000_weekly_notes.sql', import.meta.url));
  assertEquals(migration.includes(`check (days_covered between ${daysNeeded} and 7)`), true);
});

Deno.test('a read failing before the claim does not use up an attempt', async () => {
  const { store, calls } = fakeStore({ answers: [mon, tue, wed], baseline: answer('2026-09-01T15:00:00Z') });
  const broken: Store = { ...store, answer: () => Promise.reject(new Error('database hiccup')) };
  await assertRejects(() => getWeeklyNote({ store: broken, model: fakeModel('x').model, modelName: 'm', now }), Error, 'hiccup');
  assertEquals(calls.claims, 0);
  const brokenNotebook: Store = { ...store, notebook: () => Promise.reject(new Error('notebook hiccup')) };
  await assertRejects(() => getWeeklyNote({ store: brokenNotebook, model: fakeModel('x').model, modelName: 'm', now }), Error, 'hiccup');
  assertEquals(calls.claims, 0);
});

Deno.test('a request that loses the claim to a winner that has just saved gets the note, not "writing"', async () => {
  const { store } = fakeStore({
    answers: [mon, tue, wed],
    alreadyClaimed: true,
    savedAfterClaim: { text: 'Just written.', days_covered: 3 },
  });
  // The first read (the due check) finds nothing; the read after the lost claim finds the winner's note.
  const reply = await getWeeklyNote({ store, model: fakeModel('unused').model, modelName: 'm', now });
  assertEquals(reply, { practiceDays: 3, daysNeeded: 3, note: 'Just written.', writing: false, gaveUp: false });
});

Deno.test('a week that is still being scored is not "writing": nothing is due yet', async () => {
  const { store } = fakeStore({ answers: [mon, tue, unscored('2026-10-07T15:00:00Z')] });
  const reply = await getWeeklyNote({ store, model: fakeModel('x').model, modelName: 'm', now });
  assertEquals(reply.writing, false);
});

Deno.test('the SDK does not retry by itself: a server retry-after has no ceiling', () => {
  assertEquals(modelRetries, 0);
});

Deno.test('when the attempts are used up the reply says it gave up, not that a note is being written', async () => {
  const { store } = fakeStore({ answers: [mon, tue, wed], alreadyClaimed: true, attempts: maxAttemptsPerWeek });
  const reply = await getWeeklyNote({ store, model: fakeModel('unused').model, modelName: 'm', now });
  assertEquals(reply, { practiceDays: 3, daysNeeded: 3, note: null, writing: false, gaveUp: true });
});

Deno.test('the claim is asked for with the days the note would cover', async () => {
  const seen: number[] = [];
  const { store } = fakeStore({ answers: [mon, tue, wed, thu], saved: { text: 'Old.', days_covered: 3 } });
  const spy: Store = { ...store, claim: (w, l) => { seen.push(l.daysCovered); return store.claim(w, l); } };
  await getWeeklyNote({ store: spy, model: fakeModel('x').model, modelName: 'm', now });
  assertEquals(seen, [4]);
});

Deno.test('a request still running its last attempt is writing, not given up', async () => {
  const { store } = fakeStore({ answers: [mon, tue, wed], alreadyClaimed: true, attempts: maxAttemptsPerWeek, claimAgeSeconds: 10 });
  const reply = await getWeeklyNote({ store, model: fakeModel('unused').model, modelName: 'm', now });
  assertEquals(reply, { practiceDays: 3, daysNeeded: 3, note: null, writing: true, gaveUp: false });
});

Deno.test('the function really gives the model call its deadline and no SDK retries', async () => {
  const index = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  // The sums above only hold if the real wiring uses these values.
  assertEquals(index.includes('deadlineMs: modelTimeoutMs'), true);
  assertEquals(index.includes('maxRetries: modelRetries'), true);
  assertEquals(index.includes('timeoutMs: modelTimeoutMs'), true);
});
