import type { Metrics, Transcript } from '../supabase/functions/_shared/schemas/metrics.ts';

export type Clip = {
  answerId: string;
  audioPath: string;
  note: string;
  hesitations: number | null;
  fillers: Record<string, number> | null;
  pauses?: number | null; // silent gaps of 2 seconds or more you left on purpose
  restarts?: number | null; // phrases you repeated
  reference: string | null;
};

// Every way a provider might write a hesitation. Measure only counts um and uh, so this list is how we
// notice a provider that heard you but spelled it "ah" or "erm".
const hesitationSpellings = new Set(['um', 'umm', 'uhm', 'uh', 'uhh', 'ah', 'ahh', 'er', 'erm', 'eh', 'hm', 'hmm', 'mm', 'mmm', 'mhm']);

const ones = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

// Providers disagree on "ten" vs "10". Spell small numbers out so that isn't counted as a word mistake.
function spellNumber(token: string): string[] {
  if (!/^\d{1,2}$/.test(token)) return [token];
  const n = Number(token);
  if (n < 20) return [ones[n]];
  return n % 10 === 0 ? [tens[n / 10]] : [tens[Math.floor(n / 10)], ones[n % 10]];
}

const normalizeWords = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .flatMap(spellNumber);

type Tally = { expected: number; found: number; caught: number; missed: number; extra: number };

function tally(expected: number, found: number): Tally {
  return { expected, found, caught: Math.min(expected, found), missed: Math.max(expected - found, 0), extra: Math.max(found - expected, 0) };
}

// The deciding number. um, uh and the like are one group: providers swap them (Nova-2 wrote "um" where
// the speaker said "uh"), and nobody can reliably tell which was said.
export function scoreHesitations(metrics: Metrics, expected: number): Tally {
  const { um = 0, uh = 0 } = metrics.fillers.byWord;
  return tally(expected, um + uh);
}

// The ordinary-word fillers (so, like, actually, ...), one tally per word and one for all of them.
export function scoreFillers(metrics: Metrics, expected: Record<string, number>) {
  const words = new Set([...Object.keys(expected), ...Object.keys(metrics.fillers.byWord)]);
  const byWord: Record<string, Tally> = {};
  for (const word of words) {
    if (word === 'um' || word === 'uh') continue; // scored as hesitations
    byWord[word] = tally(expected[word] ?? 0, metrics.fillers.byWord[word] ?? 0);
  }
  const all = Object.values(byWord).reduce(
    (sum, t) => ({ expected: sum.expected + t.expected, found: sum.found + t.found, caught: sum.caught + t.caught, missed: sum.missed + t.missed, extra: sum.extra + t.extra }),
    { expected: 0, found: 0, caught: 0, missed: 0, extra: 0 },
  );
  return { byWord, all };
}

// Every hesitation-like token the provider returned, spelled as it came back: { um: 3, ah: 1 }.
export function rawHesitations(transcript: Transcript): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const word of transcript.words) {
    const spelled = normalizeWords(word.text).join('');
    if (hesitationSpellings.has(spelled)) counts[spelled] = (counts[spelled] ?? 0) + 1;
  }
  return counts;
}

// Word error rate: (wrong + missing + extra words) / words in the reference. Hesitations are left out on both sides,
// because they are scored separately. Returns null when there is no reference to compare against.
export function wordErrorRate(reference: string | null, transcript: Transcript): number | null {
  if (!reference) return null;
  const real = (words: string[]) => words.filter((w) => !hesitationSpellings.has(w));
  const expected = real(normalizeWords(reference));
  const heard = real(normalizeWords(transcript.words.map((w) => w.text).join(' ')));
  if (expected.length === 0) return null;

  // Standard edit distance over words, keeping one row at a time.
  let previous = Array.from({ length: heard.length + 1 }, (_, j) => j);
  for (let i = 1; i <= expected.length; i++) {
    const row = [i];
    for (let j = 1; j <= heard.length; j++) {
      const swap = previous[j - 1] + (expected[i - 1] === heard[j - 1] ? 0 : 1);
      row.push(Math.min(swap, previous[j] + 1, row[j - 1] + 1));
    }
    previous = row;
  }
  return previous[heard.length] / expected.length;
}
