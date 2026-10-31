import { stepWords, withoutPauseMarks } from '../supabase/functions/_shared/pipeline/map.ts';
import { findQuote, secondsIntoAnswer, splitSentences } from '../supabase/functions/_shared/pipeline/transcriptText.ts';
import type { MapOutput, StepLabel } from '../supabase/functions/_shared/schemas/map.ts';
import type { Transcript } from '../supabase/functions/_shared/schemas/metrics.ts';
import { cohenKappa } from './listenerStats.ts';

// The Map eval's sums. An AI map is turned into the same shape as the owner's labels (one label per sentence), so the
// two can be compared. Sentence numbers start at 1, as on the sheet.

export type Reading = {
  labels: StepLabel[];
  point: number | null;
  restarts: number[];
  pointAtSeconds: number | null;
  offTrackShare: number;
};

// Each sentence gets the label of the step it starts in.
export function sentenceLabels(map: MapOutput, transcript: Transcript): StepLabel[] {
  const starts = stepWords(map, transcript);
  return splitSentences(transcript).map(({ first }) => {
    const step = starts.findLastIndex((at) => at !== null && at <= first);
    if (step === -1) throw new Error('a sentence falls before the first step');
    return map.steps[step].label;
  });
}

// The sentences a map's restart quotes fall in.
export function restartSentences(map: MapOutput, transcript: Transcript): number[] {
  const sentences = splitSentences(transcript);
  const found = map.restarts.flatMap(({ quote }) => {
    const at = findQuote(transcript, withoutPauseMarks(quote));
    return at === null ? [] : [sentences.findIndex((s) => s.first <= at.first && at.first <= s.last) + 1];
  });
  return [...new Set(found)].sort((a, b) => a - b);
}

// A reading from labels alone, using the same rules for time as the Map stage: when the listener first knew where the
// answer was going, and the share of the time spoken in off-track sentences.
export function readLabels(labels: StepLabel[], restarts: number[], transcript: Transcript): Reading {
  const words = transcript.words;
  const sentences = splitSentences(transcript);
  if (sentences.length !== labels.length) throw new Error(`${labels.length} labels for ${sentences.length} sentences`);
  const startOf = (i: number) => words[sentences[i].first].start;
  const lastEnd = words[words.length - 1].end;
  const spoken = lastEnd - words[0].start;
  const offTrack = labels.reduce((sum, label, i) => (label === 'off_track' ? sum + ((i + 1 < sentences.length ? startOf(i + 1) : lastEnd) - startOf(i)) : sum), 0);
  const firstDirection = labels.findIndex((l) => l === 'direction' || l === 'point');
  const firstPoint = labels.indexOf('point');
  return {
    labels,
    point: firstPoint === -1 ? null : firstPoint + 1,
    restarts,
    pointAtSeconds: firstDirection === -1 ? null : Math.round(secondsIntoAnswer(transcript, startOf(firstDirection)) * 10) / 10,
    offTrackShare: spoken > 0 ? Math.round((offTrack / spoken) * 100) / 100 : 0,
  };
}

export function readMap(map: MapOutput, transcript: Transcript): Reading {
  return readLabels(sentenceLabels(map, transcript), restartSentences(map, transcript), transcript);
}

export type Comparison = {
  pairs: number;
  sentences: number;
  kappa: number;
  samePoint: number;
  // Answers the first reader says have no point, and the second finds one, and the other way round.
  onlySecondFoundPoint: number;
  onlyFirstFoundPoint: number;
  firstFoundPoint: number;
  secondFoundPoint: number;
  sameRestartCount: number;
  firstRestarts: number;
  secondRestarts: number;
  // Mean difference over the answers where both readers have a time.
  secondsToPointDifference: number | null;
  offTrackDifference: number;
};

const mean = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

// How two readers of the same answers compare: the owner and the AI, or the AI's first run and its second.
export function compareReadings(pairs: { first: Reading; second: Reading }[]): Comparison {
  const count = (test: (first: Reading, second: Reading) => boolean) => pairs.filter(({ first, second }) => test(first, second)).length;
  const firstLabels = pairs.flatMap((p) => p.first.labels);
  const secondLabels = pairs.flatMap((p) => p.second.labels);
  const timed = pairs.filter((p) => p.first.pointAtSeconds !== null && p.second.pointAtSeconds !== null);
  const sum = (reader: 'first' | 'second') => pairs.reduce((total, p) => total + p[reader].restarts.length, 0);
  return {
    pairs: pairs.length,
    sentences: firstLabels.length,
    kappa: firstLabels.length === 0 ? NaN : cohenKappa(firstLabels, secondLabels),
    samePoint: count((a, b) => a.point === b.point),
    onlySecondFoundPoint: count((a, b) => a.point === null && b.point !== null),
    onlyFirstFoundPoint: count((a, b) => a.point !== null && b.point === null),
    firstFoundPoint: count((a) => a.point !== null),
    secondFoundPoint: count((_, b) => b.point !== null),
    sameRestartCount: count((a, b) => a.restarts.length === b.restarts.length),
    firstRestarts: sum('first'),
    secondRestarts: sum('second'),
    secondsToPointDifference: mean(timed.map((p) => Math.abs(p.first.pointAtSeconds! - p.second.pointAtSeconds!))),
    offTrackDifference: mean(pairs.map((p) => Math.abs(p.first.offTrackShare - p.second.offTrackShare))) ?? 0,
  };
}

// The kinds of reason a reply was refused, with the person's words taken out, so they can go in the committed report.
export function problemKinds(problems: string[]): { kind: string; times: number }[] {
  const kinds = problems.flatMap((p) => p.replace(/^map reply rejected: /, '').split('; ')).map((p) => p.replace(/"[^"]*"/g, '"..."').replace(/step \d+/, 'a step').replace(/after step \d+/, 'after the step before').slice(0, 120));
  return [...Map.groupBy(kinds, (k) => k)].map(([kind, list]) => ({ kind, times: list.length })).sort((a, b) => b.times - a.times);
}
