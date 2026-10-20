import { z } from 'npm:zod@4';

// The listener check (ARCHITECTURE.md, Evals): friends open a page with their own secret link, hear each clip once,
// and rate it. This file is the logic; index.ts wires it to the database and storage.

const code = z.string().regex(/^c\d{2}$/);

export const manifestSchema = z.object({
  clips: z.array(
    z.object({
      code,
      answerId: z.uuid(),
      audioPath: z.string(),
      round: z.enum(['candidate', 'calibration', 'main']),
      category: z.enum(['work', 'everyday']),
      retryOf: code.nullable(),
      timerStopped: z.boolean(),
    }),
  ),
});
export type Clip = z.infer<typeof manifestSchema>['clips'][number];

// What a friend is shown, in order. A pair is two answers to the same question, labelled A and B in an order of their
// own, so nothing says which one is the retry.
export type Item = { clip: string; round: 'calibration' | 'main'; pair: number | null; side: 'A' | 'B' | null };

// A main retry whose first try is also main is played as a pair. Each first try has at most one such retry, or the
// friend would hear it twice.
export function pairsOf(clips: Clip[]): [first: string, retry: string][] {
  const byCode = new Map(clips.map((c) => [c.code, c]));
  const pairs: [string, string][] = [];
  for (const clip of clips) {
    if (clip.round !== 'main' || !clip.retryOf) continue;
    const first = byCode.get(clip.retryOf);
    if (!first) throw new Error(`${clip.code} is a retry of ${clip.retryOf}, which is not in the list`);
    if (first.round !== 'main') continue;
    if (pairs.some(([f]) => f === first.code)) throw new Error(`${first.code} has more than one main retry`);
    pairs.push([first.code, clip.code]);
  }
  return pairs;
}

async function shuffleKey(rater: string, value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${rater}:${value}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Sorted by a hash of the friend and the clip: shuffled differently for each friend, and the same on every visit.
async function shuffled(rater: string, values: string[]): Promise<string[]> {
  const keyed = await Promise.all(values.map(async (v) => ({ v, key: await shuffleKey(rater, v) })));
  return keyed.sort((a, b) => (a.key < b.key ? -1 : 1)).map(({ v }) => v);
}

// Calibration first (talked over together before the real round), then single answers, then the pairs.
export async function itemsFor(rater: string, clips: Clip[]): Promise<Item[]> {
  const pairs = pairsOf(clips);
  const inPair = new Set(pairs.flat());
  const calibration = await shuffled(rater, clips.filter((c) => c.round === 'calibration').map((c) => c.code));
  const singles = await shuffled(rater, clips.filter((c) => c.round === 'main' && !inPair.has(c.code)).map((c) => c.code));
  const pairOrder = await shuffled(rater, pairs.map(([first]) => first));
  const items: Item[] = [
    ...calibration.map((clip): Item => ({ clip, round: 'calibration', pair: null, side: null })),
    ...singles.map((clip): Item => ({ clip, round: 'main', pair: null, side: null })),
  ];
  for (const [index, first] of pairOrder.entries()) {
    const pair = pairs.find(([f]) => f === first)!;
    const [a, b] = await shuffled(rater, [...pair]);
    items.push({ clip: a, round: 'main', pair: index + 1, side: 'A' }, { clip: b, round: 'main', pair: index + 1, side: 'B' });
  }
  return items;
}

// The LISTENER_RATERS secret: "R1:<token>,R2:<token>". Returns token -> pseudonym.
export function parseRaters(secret: string): Map<string, string> {
  const raters = new Map<string, string>();
  for (const entry of secret.split(',').map((e) => e.trim()).filter(Boolean)) {
    const [name, token] = entry.split(':');
    if (!/^R\d$/.test(name ?? '') || !token || token.length < 20) throw new Error('LISTENER_RATERS entries look like R1:<token of 20+ characters>');
    raters.set(token, name);
  }
  return raters;
}

const text = (max: number) => z.string().trim().min(1).max(max);

export const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), token: z.string() }),
  z.object({ action: z.literal('play'), token: z.string(), clip: code }),
  z.object({
    action: z.literal('rate'),
    token: z.string(),
    clip: code,
    point: text(1000),
    effort: z.number().int().min(1).max(5),
    hasSupport: z.boolean(),
    clearEnding: z.boolean(),
    wouldCut: z.boolean(),
    stoodOut: text(1000).nullable(),
    easier: code.nullable(),
  }),
]);

export type Rating = {
  rater: string;
  clip: string;
  point: string;
  effort: number;
  has_support: boolean;
  clear_ending: boolean;
  would_cut: boolean;
  stood_out: string | null;
  easier: string | null;
};

export interface Store {
  ratedClips(rater: string): Promise<string[]>;
  signedUrl(clip: string): Promise<string>;
  saveRating(rating: Rating): Promise<void>;
}

export type Reply = { status: number; body: Record<string, unknown> };

export async function handle(input: unknown, deps: { raters: Map<string, string>; clips: Clip[]; store: Store }): Promise<Reply> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { status: 400, body: { error: 'bad_request' } };
  const req = parsed.data;
  const rater = deps.raters.get(req.token);
  if (!rater) return { status: 401, body: { error: 'unknown_link' } };

  const items = await itemsFor(rater, deps.clips);
  if (req.action === 'start') return { status: 200, body: { items, rated: await deps.store.ratedClips(rater) } };

  const item = items.find((i) => i.clip === req.clip);
  if (!item) return { status: 404, body: { error: 'not_found' } };

  if (req.action === 'play') {
    // Each clip is heard once: a clip already rated is not played again.
    if ((await deps.store.ratedClips(rater)).includes(req.clip)) return { status: 409, body: { error: 'already_rated' } };
    return { status: 200, body: { url: await deps.store.signedUrl(req.clip) } };
  }

  // The second clip of a pair carries the choice between the two; nothing else may.
  const pairCodes = items.filter((i) => i.pair !== null && i.pair === item.pair).map((i) => i.clip);
  const choiceOk = item.side === 'B' ? req.easier !== null && pairCodes.includes(req.easier) : req.easier === null;
  if (!choiceOk) return { status: 400, body: { error: 'bad_request' } };

  await deps.store.saveRating({
    rater,
    clip: req.clip,
    point: req.point,
    effort: req.effort,
    has_support: req.hasSupport,
    clear_ending: req.clearEnding,
    would_cut: req.wouldCut,
    stood_out: req.stoodOut,
    easier: req.easier,
  });
  return { status: 200, body: { ok: true } };
}
