import type { Metrics, Transcript } from '../schemas/metrics.ts';

// Stage 2: Measure. Plain code, no AI, no network. The same transcript always gives the same numbers.
// Saved on every answer in pipeline_version, so bump it when any rule below changes.
export const measureVersion = 2;

// Speed bands, in words per minute. Everyday speech is roughly 120 to 160. These are first guesses
// to tune against real recordings in Part B.
export const slowBelowWpm = 110;
export const fastAboveWpm = 170;
// Too few words make a speed number meaningless.
export const minWordsForPace = 10;
// A gap between two words this long counts as a long pause.
export const longPauseMs = 2000;
// "I think, I think we..." repeats up to this many words.
const longestRestart = 3;

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

const sentenceEnd = /[.?!]["')\]]*$/;
// A comma, dash or full stop after a word means the next word is not part of the same phrase.
const endsWithPunctuation = /[,;:.?!\u2014-]["')\]]*$/;

function normalize(word: string): string {
  return word.toLowerCase().replace(/[^a-z']/g, '');
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

  const byWord: Record<string, number> = {};
  const count = (filler: string) => {
    byWord[filler] = (byWord[filler] ?? 0) + 1;
  };

  for (let i = 0; i < words.length; i++) {
    const word = text[i];
    // The word right before, but only when it runs straight into this one: "do you know" is a question,
    // "we do, you know, ..." is a filler.
    const previous = i > 0 && !endsWithPunctuation.test(words[i - 1].punctuated) ? text[i - 1] : null;
    const noise = noiseFiller(word);
    if (noise) count(noise);
    else if (word === 'basically' || word === 'actually') count(word);
    else if (word === 'like' && !(previous && likeIsRealAfter.has(previous))) count('like');
    else if (word === 'you' && text[i + 1] === 'know' && !(previous && youKnowIsRealAfter.has(previous))) {
      count('you know');
      i++; // "know" is part of this filler
    } else if (word === 'so' && (i === 0 || sentenceEnd.test(words[i - 1].punctuated))) count('so');
  }
  const total = Object.values(byWord).reduce((sum, n) => sum + n, 0);

  // Speed: spoken words over the time from the first word to the last, so silence at either end doesn't count.
  const spoken = text.filter((w) => w !== '' && !noiseFiller(w)).length;
  const speakingSeconds = words.length > 0 ? words[words.length - 1].end - words[0].start : 0;
  let wordsPerMinute: number | null = null;
  if (spoken >= minWordsForPace && speakingSeconds > 0) {
    wordsPerMinute = Math.round((spoken / speakingSeconds) * 60);
  }
  const band = wordsPerMinute === null ? null : wordsPerMinute < slowBelowWpm ? 'too_slow' : wordsPerMinute > fastAboveWpm ? 'too_fast' : 'good';

  const pauseAt: number[] = [];
  let longestMs = 0;
  for (let i = 1; i < words.length; i++) {
    const gapMs = Math.round((words[i].start - words[i - 1].end) * 1000);
    if (gapMs >= longPauseMs) {
      pauseAt.push(round1(words[i - 1].end));
      longestMs = Math.max(longestMs, gapMs);
    }
  }

  return {
    wordCount: spoken,
    fillers: { total, byWord },
    pace: { wordsPerMinute, band },
    pauses: { count: pauseAt.length, longestMs, atSeconds: pauseAt },
    restarts: findRestarts(words, text),
  };
}

// A restart is the same 1 to 3 words said twice in a row, ignoring um and uh and punctuation.
function findRestarts(words: Transcript['words'], text: string[]): Metrics['restarts'] {
  const kept = words.flatMap((w, i) => (text[i] !== '' && !noiseFiller(text[i]) ? [{ word: text[i], start: w.start }] : []));
  const atSeconds: number[] = [];
  for (let i = 0; i < kept.length; i++) {
    for (let n = longestRestart; n >= 1; n--) {
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
