import type { Metrics, Transcript } from '../schemas/metrics.ts';

// Stage 2: Measure. Plain code, no AI, no network. The same transcript always gives the same numbers.
// Saved on every answer in pipeline_version, so bump it when any rule below changes.
export const measureVersion = 4;

// Speed bands, in words per minute. Everyday speech is roughly 120 to 160. These are first guesses
// to tune against real recordings.
export const slowBelowWpm = 110;
export const fastAboveWpm = 170;
// Too few words make a speed number meaningless.
export const minWordsForPace = 10;
// A gap between two words this long counts as a pause. Studies of pauses inside a sentence count much shorter ones;
// a second is still clearly noticeable, and each pause keeps its length so this can be raised later.
export const longPauseMs = 1000;
// "I think, I think we..." repeats up to this many words.
const longestRepeat = 3;

type Input = { transcript: Transcript };

// Words that, right before "like", mean it is a real verb or a comparison, not a filler:
// "I like it", "it looks like rain", "I'd like to".
const likeIsRealAfter = new Set([
  'i', 'you', 'we', 'they', 'he', 'she',
  "i'd", "you'd", "we'd", "they'd", "he'd", "she'd",
  'would', 'to', "don't", "didn't",
  'look', 'looks', 'looked', 'feel', 'feels', 'felt',
  'sound', 'sounds', 'sounded', 'seem', 'seems', 'seemed',
]);

// Words that, right before "you know", mean it is a real question: "do you know", "if you know".
const youKnowIsRealAfter = new Set(['do', 'did', "don't", "didn't", 'if', 'can', 'could', 'would', 'will']);

// Words that, right before "kind of" or "sort of", make it a noun ("what kind of car", "a sort of tool"), not a hedge.
const kindIsNounAfter = new Set([
  'what', 'which', 'a', 'an', 'the', 'this', 'that', 'these', 'those', 'any', 'some', 'every', 'each', 'one',
  'same', 'different', 'other', 'another', 'no', 'my', 'your', 'our', 'their', 'his', 'her', 'its',
]);

// Vague words, from the three categories in reports/Listener clarity and effort in speech.md: an unclear name, an
// unclear amount, many kinds. "Kind of" and "sort of" are counted as hedges only.
const vagueWords = new Set(['thing', 'things', 'stuff', 'something', 'somehow', 'lots', 'some', 'various', 'aspects']);
const vaguePairs = new Set(['a lot', 'a few', 'types of']);

const sentenceEnd = /[.?!]["')\]]*$/;
// A comma, dash or full stop after a word means the next word is not part of the same phrase.
const endsWithPunctuation = /[,;:.?!\u2014-]["')\]]*$/;

function normalize(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9']/g, '');
}

// um, umm, uhm, uh, uhh. These are noises, not words, so they don't count toward speed.
function noiseFiller(word: string): 'um' | 'uh' | null {
  if (/^(um+|uhm+)$/.test(word)) return 'um';
  if (/^uh+$/.test(word)) return 'uh';
  return null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function measure({ transcript }: Input): Metrics {
  const words = transcript.words;
  const text = words.map((w) => normalize(w.text));
  // The word right before, but only when it runs straight into this one: "do you know" is a question,
  // "we do, you know, ..." is a filler.
  const previous = (i: number) => (i > 0 && !endsWithPunctuation.test(words[i - 1].punctuated) ? text[i - 1] : null);
  // The two words from i, when nothing (a comma, a full stop) comes between them: "kind of", "a lot".
  const pair = (i: number) => (i + 1 < words.length && !endsWithPunctuation.test(words[i].punctuated) ? `${text[i]} ${text[i + 1]}` : null);

  const fillers: Record<string, number> = {};
  for (let i = 0; i < words.length; i++) {
    const word = text[i];
    const before = previous(i);
    const noise = noiseFiller(word);
    if (noise) add(fillers, noise);
    else if (word === 'basically' || word === 'actually') add(fillers, word);
    else if (word === 'like' && !(before && likeIsRealAfter.has(before))) add(fillers, 'like');
    else if (word === 'you' && text[i + 1] === 'know' && !(before && youKnowIsRealAfter.has(before))) {
      add(fillers, 'you know');
      i++; // "know" is part of this filler
    } else if (word === 'so' && (i === 0 || sentenceEnd.test(words[i - 1].punctuated))) add(fillers, 'so');
  }
  const fillerTotal = sum(fillers);

  const hedges: Record<string, number> = {};
  const hedgeAt: number[] = [];
  const vague: Record<string, number> = {};
  let ands = 0;
  for (let i = 0; i < words.length; i++) {
    const word = text[i];
    const two = pair(i);
    const before = previous(i);
    if ((two === 'kind of' || two === 'sort of') && !(before && kindIsNounAfter.has(before))) {
      add(hedges, two);
      hedgeAt.push(round1(words[i].start));
      i++;
    } else if (two === 'i guess') {
      add(hedges, two);
      hedgeAt.push(round1(words[i].start));
      i++;
    } else if (word === 'kinda' || word === 'sorta') {
      add(hedges, word);
      hedgeAt.push(round1(words[i].start));
    } else if (two !== null && vaguePairs.has(two)) {
      add(vague, two);
      i++;
    } else if (vagueWords.has(word)) add(vague, word);
    else if (word === 'and') ands++;
  }

  // Speed: spoken words over the time from the first word to the last, so silence at either end doesn't count.
  const spoken = text.filter((w) => w !== '' && !noiseFiller(w)).length;
  const speakingSeconds = words.length > 0 ? words[words.length - 1].end - words[0].start : 0;
  let wordsPerMinute: number | null = null;
  if (spoken >= minWordsForPace && speakingSeconds > 0) {
    wordsPerMinute = Math.round((spoken / speakingSeconds) * 60);
  }
  const band = wordsPerMinute === null ? null : wordsPerMinute < slowBelowWpm ? 'too_slow' : wordsPerMinute > fastAboveWpm ? 'too_fast' : 'good';

  // A pause after a full stop, question mark or exclamation mark falls between sentences; anywhere else it is mid-sentence.
  const pauses: Metrics['pauses'] = [];
  for (let i = 1; i < words.length; i++) {
    const ms = Math.round((words[i].start - words[i - 1].end) * 1000);
    if (ms >= longPauseMs) pauses.push({ atSeconds: round1(words[i - 1].end), ms, midSentence: !sentenceEnd.test(words[i - 1].punctuated) });
  }

  return {
    wordCount: spoken,
    speakingSeconds: round1(speakingSeconds),
    fillers: { total: fillerTotal, byWord: fillers, perMinute: speakingSeconds > 0 ? round1((fillerTotal / speakingSeconds) * 60) : null },
    pace: { wordsPerMinute, band },
    pauses,
    repeats: findRepeats(words, text),
    hedges: { total: sum(hedges), byPhrase: hedges, atSeconds: hedgeAt },
    vagueWords: { total: sum(vague), byWord: vague },
    ands: { count: ands },
  };
}

function add(counts: Record<string, number>, key: string) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function sum(counts: Record<string, number>): number {
  return Object.values(counts).reduce((total, n) => total + n, 0);
}

// A repeat is the same 1 to 3 words said twice in a row, ignoring um and uh and punctuation. Listeners barely notice
// these; a true restart (a sentence dropped and begun again) needs judgement and comes from the Map stage.
function findRepeats(words: Transcript['words'], text: string[]): Metrics['repeats'] {
  const kept = words.flatMap((w, i) => (text[i] !== '' && !noiseFiller(text[i]) ? [{ word: text[i], start: w.start }] : []));
  const atSeconds: number[] = [];
  for (let i = 0; i < kept.length; i++) {
    for (let n = longestRepeat; n >= 1; n--) {
      if (i + 2 * n > kept.length) continue;
      const repeated = kept.slice(i, i + n).every((k, j) => k.word === kept[i + n + j].word);
      if (repeated) {
        atSeconds.push(round1(kept[i + n].start));
        i += n - 1; // the second copy may itself start the next repeat: "I think I think I think"
        break;
      }
    }
  }
  return { count: atSeconds.length, atSeconds };
}
