import type { SavedMap } from '../schemas/map.ts';
import type { Metrics, Transcript } from '../schemas/metrics.ts';
import { latePointSeconds, momentAt, sentenceOpening, splitSentences } from './transcriptText.ts';

// Plain code, no AI: which single thing the tip is about, read from the map. Claude only writes the tip about this focus.
// Bump this when any rule below changes, and save it in pipeline_version.
export const tipFocusVersion = 6;

export type FocusKind = 'no_point' | 'found_late' | 'direct_late' | 'off_track' | 'ending' | 'noticed' | 'speed' | 'support' | 'polish';

// The moment the tip is about, shown quoted under it: the person's own words and when they start (seconds from the first
// spoken word). Plain code picks it from the facts, so it is always real. Version 6 added it.
export type TipMoment = { quote: string; atSeconds: number };

// `facts` are the real times and the person's own words the coach may cite. `moment` is not sent to the coach.
export type Focus = { kind: FocusKind; facts: Record<string, unknown>; moment?: TipMoment };

type Input = { metrics: Metrics; map: SavedMap; transcript: Transcript; wantsDirectAnswer: boolean; stoppedByTimeLimit: boolean };

// An answer with at least this share of its time off track gets a tip about it. A first guess, to tune on real answers.
export const offTrackShareForTip = 0.25;

// Two restarts or more join what a listener noticed. One is normal speech.
const restartsForTip = 2;

// When the noticed kinds tie on how many moments they have, the earlier one here wins.
const noticedOrder = ['fillers', 'pause', 'hedge', 'repeat', 'pattern', 'restart'] as const;

// How the point arrived: no point step, early (the listener knew where it was going within 15 seconds), late and found
// while talking (off track before it), or late and chosen (a frame or a build-up first). The notebook records this too.
export type PointArrival = 'none' | 'early' | 'found_late' | 'chosen_late';

export function pointArrival({ steps, pointAtSeconds }: Pick<SavedMap, 'steps' | 'pointAtSeconds'>): PointArrival {
  if (!steps.some((s) => s.label === 'point') || pointAtSeconds === null) return 'none';
  if (pointAtSeconds <= latePointSeconds) return 'early';
  const firstDirection = steps.findIndex((s) => s.label === 'direction' || s.label === 'point');
  return steps.slice(0, firstDirection).some((s) => s.label === 'off_track') ? 'found_late' : 'chosen_late';
}

// The first rule that matches is the focus, in this order: the point first (a listener who never gets it can't be
// helped by anything else), then how much work it was to follow, then how it sounded, then what's missing.
// A late point that was chosen (a frame or a build-up, then the point) is a skill, so it is never the focus on its own;
// only a question that wanted a direct answer makes it one (PRODUCT.md, screen 5).
export function chooseFocus({ metrics, map, transcript, wantsDirectAnswer, stoppedByTimeLimit }: Input): Focus {
  const sentences = splitSentences(transcript);
  // The first few words of a sentence (numbered from 1), so the coach can name the moment.
  const opening = (sentence: number) => sentenceOpening(transcript, sentences[sentence - 1]);
  const momentOf = (quote: string) => momentAt(transcript, quote);
  const moment = (quote: string): { moment?: TipMoment } => {
    const atSeconds = quote.trim() === '' ? null : momentOf(quote);
    return atSeconds === null ? {} : { moment: { quote, atSeconds } };
  };

  const { steps, pointAtSeconds } = map;
  const pointStep = steps.find((s) => s.label === 'point');
  const pointQuote = map.point.quote;

  const arrival = pointArrival(map);
  if (!pointStep || arrival === 'none') return { kind: 'no_point', facts: { listenerHeard: map.point.restatement } };

  if (arrival === 'found_late') {
    const firstDirection = steps.findIndex((s) => s.label === 'direction' || s.label === 'point');
    return {
      kind: 'found_late',
      facts: {
        listenerKnewWhereAtSeconds: pointAtSeconds,
        passesAroundItFirst: steps.slice(0, firstDirection).filter((s) => s.label === 'off_track').length,
        firstWords: opening(1),
        pointQuote,
      },
      ...moment(opening(1)),
    };
  }

  if (wantsDirectAnswer && pointStep.atSeconds > latePointSeconds) {
    return {
      kind: 'direct_late',
      facts: { pointAtSeconds: pointStep.atSeconds, pointQuote, firstWords: opening(1), questionWantedADirectAnswer: true },
      ...moment(opening(1)),
    };
  }

  if (map.offTrackShare >= offTrackShareForTip) {
    const offTrack = steps.filter((s) => s.label === 'off_track');
    return {
      kind: 'off_track',
      facts: {
        offTrackPercent: Math.round(map.offTrackShare * 100),
        offTrackParts: offTrack.map((s) => ({ atSeconds: s.atSeconds, firstWords: opening(s.sentence) })),
      },
      ...moment(opening(offTrack[0].sentence)),
    };
  }

  if (!stoppedByTimeLimit && !steps.some((s) => s.label === 'ending')) {
    const lastWords = transcript.words.slice(-8).map((w) => w.punctuated).join(' ');
    return { kind: 'ending', facts: { lastWords, pointQuote }, ...moment(lastWords) };
  }

  const moments = [
    ...map.noticed.map((n) => ({ kind: n.kind, quote: n.quote, why: n.why })),
    ...(map.restarts.length >= restartsForTip ? map.restarts.map((r) => ({ kind: 'restart' as const, quote: r.quote, why: 'A sentence dropped and begun again.' })) : []),
  ];
  if (moments.length > 0) {
    const count = (kind: string) => moments.filter((m) => m.kind === kind).length;
    const kind = [...noticedOrder].sort((a, b) => count(b) - count(a))[0];
    const chosen = moments.filter((m) => m.kind === kind);
    return {
      kind: 'noticed',
      facts: {
        what: kind,
        moments: chosen.map((m) => ({ quote: m.quote, atSeconds: momentOf(m.quote), why: m.why })),
        ...(kind === 'fillers' ? { fillerCounts: metrics.fillers.byWord } : {}),
      },
      ...moment(chosen[0].quote),
    };
  }

  const { band, wordsPerMinute } = metrics.pace;
  if (band === 'too_fast' || band === 'too_slow') return { kind: 'speed', facts: { band, wordsPerMinute } };

  if (!steps.some((s) => s.label === 'support')) return { kind: 'support', facts: { pointQuote }, ...moment(pointQuote) };

  return { kind: 'polish', facts: {} };
}
