import { assertEquals, assertThrows } from 'jsr:@std/assert@1';

import manifest from './clips.json' with { type: 'json' };
import { type Clip, handle, itemsFor, manifestSchema, pairsOf, parseRaters, type Rating, type Store } from './listenerCheck.ts';

const clip = (code: string, round: Clip['round'], retryOf: string | null = null): Clip => ({
  code,
  answerId: crypto.randomUUID(),
  audioPath: `u/${code}.m4a`,
  round,
  category: 'work',
  retryOf,
  timerStopped: false,
});

const clips = [
  clip('c01', 'calibration'),
  clip('c02', 'calibration'),
  clip('c03', 'main'),
  clip('c04', 'main'),
  clip('c05', 'main'),
  clip('c06', 'main', 'c05'),
  clip('c07', 'main'),
  clip('c08', 'main', 'c07'),
  clip('c09', 'candidate', 'c07'),
  clip('c10', 'candidate'),
];

const token = 'a'.repeat(24);
const raters = parseRaters(`R1:${token}, R2:${'b'.repeat(24)}`);

function fakeStore() {
  const saved: Rating[] = [];
  const store: Store = {
    ratedClips: () => Promise.resolve(saved.map((r) => r.clip)),
    signedUrl: (c) => Promise.resolve(`https://signed/${c}`),
    saveRating: (r) => {
      saved.push(r);
      return Promise.resolve();
    },
  };
  return { saved, store };
}

const rating = (clip: string, easier: string | null = null) => ({
  action: 'rate',
  token,
  clip,
  point: 'They want to ship the small version first.',
  effort: 2,
  hasSupport: true,
  clearEnding: false,
  wouldCut: false,
  stoodOut: null,
  easier,
});

Deno.test('the committed clip list is valid and its pairs are well formed', () => {
  pairsOf(manifestSchema.parse(manifest).clips);
});

Deno.test('order: calibration, then singles, then pairs as A and B; candidates never shown', async () => {
  const items = await itemsFor('R1', clips);
  assertEquals(items.map((i) => i.round), ['calibration', 'calibration', 'main', 'main', 'main', 'main', 'main', 'main']);
  assertEquals(new Set(items.slice(0, 2).map((i) => i.clip)), new Set(['c01', 'c02']));
  const singles = items.filter((i) => i.pair === null && i.round === 'main').map((i) => i.clip);
  assertEquals(new Set(singles), new Set(['c03', 'c04']));
  const pairs = items.slice(-4);
  assertEquals(pairs.map((i) => i.side), ['A', 'B', 'A', 'B']);
  assertEquals(new Set([pairs[0].clip, pairs[1].clip]).size, 2);
  assertEquals(pairs[0].pair, pairs[1].pair);
  assertEquals(new Set(pairs.map((i) => i.clip)), new Set(['c05', 'c06', 'c07', 'c08']));
  assertEquals(items.some((i) => i.clip === 'c09' || i.clip === 'c10'), false);
});

Deno.test('the order is the same on every visit and differs between friends', async () => {
  const many = Array.from({ length: 20 }, (_, i) => clip(`c${String(i + 1).padStart(2, '0')}`, 'main'));
  assertEquals(await itemsFor('R1', many), await itemsFor('R1', many));
  const r1 = (await itemsFor('R1', many)).map((i) => i.clip).join();
  const r2 = (await itemsFor('R2', many)).map((i) => i.clip).join();
  assertEquals(r1 === r2, false);
});

Deno.test('a first try with two main retries is refused', () => {
  assertThrows(() => pairsOf([clip('c01', 'main'), clip('c02', 'main', 'c01'), clip('c03', 'main', 'c01')]));
});

Deno.test('rater secret: malformed entries are refused', () => {
  assertThrows(() => parseRaters('R1:short'));
  assertThrows(() => parseRaters(`Bob:${token}`));
  assertEquals(parseRaters('').size, 0);
});

Deno.test('a wrong link gets 401 and nothing else', async () => {
  const { store } = fakeStore();
  const reply = await handle({ action: 'start', token: 'z'.repeat(24) }, { raters, clips, store });
  assertEquals(reply, { status: 401, body: { error: 'unknown_link' } });
});

Deno.test('a clip that is not shown to friends cannot be played', async () => {
  const { store } = fakeStore();
  assertEquals((await handle({ action: 'play', token, clip: 'c10' }, { raters, clips, store })).status, 404);
  assertEquals((await handle({ action: 'play', token, clip: 'c03' }, { raters, clips, store })).body, { url: 'https://signed/c03' });
});

Deno.test('a rated clip is not played again', async () => {
  const { store } = fakeStore();
  assertEquals((await handle(rating('c03'), { raters, clips, store })).status, 200);
  assertEquals((await handle({ action: 'play', token, clip: 'c03' }, { raters, clips, store })).status, 409);
});

Deno.test('only the second clip of a pair carries the choice, and it names a clip of that pair', async () => {
  const items = await itemsFor('R1', clips);
  const pair = items.filter((i) => i.pair === 1);
  const [a, b] = [pair[0].clip, pair[1].clip];
  const other = items.find((i) => i.pair === 2)!.clip;
  const { saved, store } = fakeStore();
  const deps = { raters, clips, store };
  assertEquals((await handle(rating(a, b), deps)).status, 400);
  assertEquals((await handle(rating(b), deps)).status, 400);
  assertEquals((await handle(rating(b, other), deps)).status, 400);
  assertEquals((await handle(rating('c03', 'c04'), deps)).status, 400);
  assertEquals((await handle(rating(b, a), deps)).status, 200);
  assertEquals(saved.map((r) => [r.rater, r.clip, r.easier]), [['R1', b, a]]);
});

Deno.test('bad input gets 400', async () => {
  const { store } = fakeStore();
  const deps = { raters, clips, store };
  assertEquals((await handle(null, deps)).status, 400);
  assertEquals((await handle({ ...rating('c03'), effort: 6 }, deps)).status, 400);
  assertEquals((await handle({ ...rating('c03'), point: '   ' }, deps)).status, 400);
});
