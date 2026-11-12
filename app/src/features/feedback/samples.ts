import { sampleMetrics } from '@/lib/sampleMetrics';
import type { Coaching } from '@/lib/schemas/coaching';
import type { AnswerMap, StepLabel } from '@/lib/schemas/map';

import type { FeedbackData } from './FeedbackReveal';

// Made-up answers for the design preview (development only), so the feedback screen can be checked in every case
// without recording anything: the two mockups from design-system/feedback-d2/, a clean answer, no lost moment, no point,
// time ran out, the tip still being written, and an answer saved before step D2.

type Sample = { name: string; data: FeedbackData; hasMoments: boolean };

function stepsOf(...steps: [StepLabel, number, string?][]): AnswerMap['steps'] {
  return steps.map(([label, atSeconds, opening], i) => ({ label, atSeconds, sentence: i + 1, ...(opening ? { opening } : {}) }));
}

function mapOf(changes: Partial<AnswerMap> & Pick<AnswerMap, 'steps' | 'point'>): AnswerMap {
  const first = changes.steps.find((s) => s.label === 'direction' || s.label === 'point');
  return { version: 9, pointAtSeconds: first?.atSeconds ?? null, offTrackShare: 0, didntFollow: [], restarts: [], noticed: [], firstWordAtSeconds: 0.4, ...changes };
}

const base = { category: 'work' as const, tryNumber: 1, metrics: sampleMetrics({ speakingSeconds: 108 }), durationMs: 112_000, timeRanOut: false, listenerConfirmed: null };

const foundLateCoaching: Coaching = {
  tip: 'Say your point in your first sentence.',
  reason: 'This question wanted a direct answer, and your point came at 1:10.',
  moment: { quote: 'So I think, well, it depends on the week', atSeconds: 0 },
  whatChanged: 'Your point moved to the front, and the part about the timer is gone.',
  betterVersion:
    'Yes, I’d move it to written updates. Most weeks the meeting is just status, and everyone could read that in two minutes. We’d keep a short call for anything that’s blocked. That way the hour goes back to real work.',
  betterSteps: [
    { label: 'point', text: 'Yes, I’d move it to written updates.' },
    { label: 'support', text: 'Most weeks the meeting is just status, and everyone could read that in two minutes.' },
    { label: 'support', text: 'We’d keep a short call for anything that’s blocked.' },
    { label: 'ending', text: 'That way the hour goes back to real work.' },
  ],
};

const foundLate: Sample = {
  name: 'Found late (Work, the mockup)',
  hasMoments: true,
  data: {
    ...base,
    question: 'Should your team move the weekly meeting to written updates?',
    coaching: foundLateCoaching,
    map: mapOf({
      point: { restatement: 'You think the weekly meeting should become a written update, with a short call only when something is blocked.' },
      steps: stepsOf(
        ['off_track', 0, 'So I think, well, it depends on the week…'],
        ['support', 18, 'Most weeks it’s just status…'],
        ['off_track', 40, 'And the timer thing…'],
        ['point', 70, 'So I’d go written…'],
        ['ending', 95, '…and see how it goes.'],
      ),
      offTrackShare: 0.4,
      didntFollow: [{ quote: 'And the timer thing', why: 'when you moved to the timer', atSeconds: 40 }],
      noticed: [
        { kind: 'pause', quote: 'we could just write it down', why: 'You stopped for 2 seconds in the middle of “we could just… write it down.”', atSeconds: 22 },
        { kind: 'pattern', quote: 'So I think', why: 'Five sentences in a row started with “So.”', nextStep: 'Start the next one with the idea itself.', atSeconds: 30 },
        { kind: 'hedge', quote: 'I guess maybe', why: 'You said “I guess” just before your point, so you sounded unsure of it.', atSeconds: 66 },
      ],
    }),
  },
};

const story: Sample = {
  name: 'Story (Everyday, confirmed)',
  hasMoments: true,
  data: {
    ...base,
    category: 'everyday',
    question: 'Tell me about a time a plan fell apart.',
    durationMs: 84_000,
    metrics: sampleMetrics({ speakingSeconds: 80 }),
    listenerConfirmed: true,
    coaching: {
      tip: 'Stop once you’ve made your point.',
      reason: 'The story worked. After your point at 0:58, a second example took another 20 seconds.',
      moment: { quote: 'And another time, at the airport', atSeconds: 64 },
      whatChanged: 'The second example is gone, so the answer ends on your point.',
      betterVersion: 'Last spring my train to Lyon was cancelled. I spent twenty minutes redoing the plan. Since then, I ask someone first.',
      betterSteps: [
        { label: 'direction', text: 'Last spring my train to Lyon was cancelled.' },
        { label: 'support', text: 'I spent twenty minutes redoing the plan.' },
        { label: 'point', text: 'Since then, I ask someone first.' },
      ],
    },
    map: mapOf({
      point: { restatement: 'When your train was cancelled, you learned that asking a stranger for help works better than planning every step.' },
      steps: stepsOf(
        ['direction', 0, 'Last spring my train to Lyon was cancelled…'],
        ['support', 12, 'I had every connection planned…'],
        ['point', 58, 'Since then, I ask someone first.'],
        ['off_track', 64, 'And another time, at the airport…'],
      ),
      offTrackShare: 0.25,
      noticed: [{ kind: 'hedge', quote: 'I kind of', why: 'You said “kind of” before your point.', atSeconds: 55 }],
    }),
  },
};

const clean: Sample = {
  name: 'Clean answer (no How it sounded row)',
  hasMoments: true,
  data: {
    ...base,
    question: 'What is a tool or habit that makes your work easier?',
    durationMs: 70_000,
    metrics: sampleMetrics({ speakingSeconds: 66 }),
    coaching: {
      tip: 'Add one real example.',
      reason: 'Your point had no example, so a listener has to take your word for it.',
      whatChanged: 'Your answer, tighter, with nothing added.',
      betterVersion: 'I write down three things to do each morning. It keeps my day from filling up with other people’s requests.',
      betterSteps: [
        { label: 'point', text: 'I write down three things to do each morning.' },
        { label: 'support', text: 'It keeps my day from filling up with other people’s requests.' },
      ],
    },
    map: mapOf({
      point: { restatement: 'You write down three things each morning so your day doesn’t fill up with other people’s requests.' },
      steps: stepsOf(['point', 0, 'I write down three things to do each morning.'], ['support', 14, 'It keeps my day from filling up…'], ['ending', 55, 'So that’s my habit.']),
    }),
  },
};

const noLostMoment: Sample = {
  name: 'No lost moment (no time button on the listener card)',
  hasMoments: true,
  data: { ...clean.data, question: 'What did you work on this week, and what comes next?', map: mapOf({ ...(clean.data.map as AnswerMap), noticed: foundLate.data.map?.noticed.slice(0, 1) ?? [] }) },
};

const noPoint: Sample = {
  name: 'No point',
  hasMoments: true,
  data: {
    ...base,
    question: 'What would you change about how your team works, and why?',
    coaching: {
      tip: 'Decide your one point, and say it in a sentence.',
      reason: 'A listener heard three ideas about the team, and couldn’t tell which one you meant.',
      whatChanged: 'Your answer in order, with nothing added.',
      betterVersion: 'The team is busy. We have a lot of meetings. Some are useful.',
      betterSteps: [{ label: 'support', text: 'The team is busy. We have a lot of meetings. Some are useful.' }],
    },
    map: mapOf({
      point: { restatement: 'You talked about meetings and about being busy, but I couldn’t tell which was your point.' },
      steps: stepsOf(['off_track', 0, 'So the team is busy…'], ['support', 30, 'We have a lot of meetings…']),
      pointAtSeconds: null,
      offTrackShare: 0.5,
      didntFollow: [{ quote: 'We have a lot of meetings', why: 'when you moved from being busy to meetings without saying how they connect', atSeconds: 30 }],
    }),
  },
};

const timeRanOut: Sample = {
  name: 'Time ran out (no ending is not a fault)',
  hasMoments: true,
  data: {
    ...story.data,
    category: 'work',
    question: 'Introduce yourself to a new team in one minute.',
    durationMs: 120_000,
    timeRanOut: true,
    listenerConfirmed: null,
    map: mapOf({ ...(story.data.map as AnswerMap), steps: stepsOf(['direction', 0, 'Hi, I’m Sam…'], ['support', 14, 'I joined the company in 2021…'], ['point', 50, 'What I care about is shipping small.']), offTrackShare: 0 }),
  },
};

const tipWriting: Sample = {
  name: 'Tip still being written',
  hasMoments: true,
  data: { ...foundLate.data, coaching: null },
};

const oldAnswer: Sample = {
  name: 'Saved before step D2 (no times, old tip)',
  hasMoments: false,
  data: {
    ...foundLate.data,
    coaching: {
      tip: 'You found your point while talking. It came at 1:10, after two passes around it. Next time, say where you’re going in your first sentence.',
      betterVersion: foundLateCoaching.betterVersion,
      betterSteps: foundLateCoaching.betterSteps,
    },
    map: {
      version: 8,
      point: { restatement: 'You think the weekly meeting should become a written update.' },
      steps: stepsOf(['off_track', 0], ['support', 18], ['off_track', 40], ['point', 70], ['ending', 95]),
      pointAtSeconds: 70,
      offTrackShare: 0.4,
      didntFollow: [{ quote: 'And the timer thing', why: 'I lost the thread when you moved to the timer.' }],
      restarts: [],
      noticed: [{ kind: 'pause', quote: 'we could just write it down', why: 'A long silence in the middle of the sentence.' }],
    },
  },
};

export const feedbackSamples: Sample[] = [foundLate, story, clean, noLostMoment, noPoint, timeRanOut, tipWriting, oldAnswer];
