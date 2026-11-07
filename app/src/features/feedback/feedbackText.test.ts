import { sampleMetrics } from '@/lib/sampleMetrics';
import type { AnswerMap, StepLabel } from '@/lib/schemas/map';

import { shorterSubtitle, soundedLines, soundedSummary, stepByStepIntro, tipMomentLine } from './feedbackText';

function mapOf(labels: StepLabel[], changes: Partial<AnswerMap> = {}): AnswerMap {
  return {
    version: 9,
    point: { restatement: 'You think the meeting should be written.' },
    steps: labels.map((label, i) => ({ label, sentence: i + 1, atSeconds: i * 10 })),
    pointAtSeconds: null,
    offTrackShare: 0,
    didntFollow: [],
    restarts: [],
    noticed: [],
    ...changes,
  };
}
const better = (...labels: StepLabel[]) => labels.map((label) => ({ label, text: 't' }));

describe('how it sounded', () => {
  it('each moment says what happened, then what to do next, in the order they happened', () => {
    const map = mapOf(['point'], {
      noticed: [
        { kind: 'pattern', quote: 'So so', why: 'Five sentences in a row started with "So."', nextStep: 'Start the next one with the idea itself.', atSeconds: 30 },
        { kind: 'pause', quote: 'we could just write it', why: 'You stopped for 2 seconds in the middle of a sentence.', atSeconds: 22 },
      ],
    });
    expect(soundedLines(map, sampleMetrics())).toEqual([
      { atSeconds: 22, text: 'You stopped for 2 seconds in the middle of a sentence. Finish the sentence, then pause.' },
      { atSeconds: 30, text: 'Five sentences in a row started with "So." Start the next one with the idea itself.' },
    ]);
  });

  it('restarts join only from two, and speed only when it is clearly off', () => {
    const one = mapOf(['point'], { restarts: [{ quote: 'The thing is', atSeconds: 48 }] });
    expect(soundedLines(one, sampleMetrics())).toEqual([]);
    const two = mapOf(['point'], { restarts: [{ quote: 'The thing is', atSeconds: 48 }, { quote: 'what I mean', atSeconds: 12 }] });
    expect(soundedLines(two, sampleMetrics()).map((l) => l.atSeconds)).toEqual([12, 48]);
    expect(soundedLines(two, sampleMetrics())[1]?.text).toBe('You dropped a sentence and began again: "The thing is". Pause, then say it once.');
    const fast = sampleMetrics({ pace: { wordsPerMinute: 195, band: 'too_fast' } });
    expect(soundedLines(mapOf(['point']), fast)).toEqual([{ atSeconds: null, text: 'You spoke at 195 words a minute, fast for a listener to keep up with. Slow down a little.' }]);
  });

  it('a map from before step D2 still gives lines, without times; a pattern with no next step keeps just what happened', () => {
    const old = mapOf(['point'], { version: 8, noticed: [{ kind: 'pattern', quote: 'So so', why: 'Every sentence starts with So.' }] });
    expect(soundedLines(old, sampleMetrics())).toEqual([{ atSeconds: null, text: 'Every sentence starts with So.' }]);
  });

  it('a clean answer has no lines', () => {
    expect(soundedLines(mapOf(['point', 'support']), sampleMetrics())).toEqual([]);
    expect(soundedSummary(1)).toBe('1 moment a listener would notice');
    expect(soundedSummary(3)).toBe('3 moments a listener would notice');
  });
});

describe('shorter and clearer', () => {
  it('names the main change, in the order the mockups show', () => {
    const work = mapOf(['off_track', 'support', 'off_track', 'point', 'ending']);
    expect(shorterSubtitle(work, better('point', 'support', 'support', 'ending'))).toBe('Your answer, with the point moved to the front');
    expect(stepByStepIntro(work, better('point', 'support', 'ending'))).toBe('Yours had two off-track steps before the point. The shorter version starts with it.');
    const story = mapOf(['direction', 'support', 'point', 'off_track']);
    expect(shorterSubtitle(story, better('direction', 'support', 'point'))).toBe('Your answer, ending on your point');
    expect(stepByStepIntro(story, better('direction', 'support', 'point'))).toBe('Yours went on after the point. The shorter version stops there.');
  });

  it('says nothing it can\'t see: no map, no steps for the shorter version, or no clear change', () => {
    expect(shorterSubtitle(null, undefined)).toBe('Your answer, shorter and clearer');
    expect(shorterSubtitle(mapOf(['off_track', 'point']), undefined)).toBe('Your answer, shorter and clearer');
    expect(stepByStepIntro(mapOf(['point', 'support']), better('point', 'support'))).toBe('Your steps, next to the shorter version’s.');
  });
});

describe('the tip\'s moment', () => {
  it('your opening words, or a later moment with its time; a cut-off quote ends in an ellipsis', () => {
    expect(tipMomentLine({ quote: 'So I think, well, it depends on the week', atSeconds: 0 })).toBe('You started with "So I think, well, it depends on the week…"');
    expect(tipMomentLine({ quote: 'And another time, at the airport', atSeconds: 64 })).toBe('At 1:04 you said "And another time, at the airport…"');
    expect(tipMomentLine({ quote: 'So ship early.', atSeconds: 50 })).toBe('At 0:50 you said "So ship early."');
  });
});
