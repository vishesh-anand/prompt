import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { Text, space } from '@/design';
import { clock } from '@/lib/clock';
import type { Coaching } from '@/lib/schemas/coaching';
import type { AnswerMap } from '@/lib/schemas/map';
import { curly } from '@/lib/typography';

import { labelName } from './answerShape';
import { type SoundedLine, stepByStepIntro } from './feedbackText';
import { TimeButton } from './TimeButton';

// From this text size up, side-by-side parts stack, so words never squeeze into a narrow column.
const stackFromFontScale = 1.35;
const useStacked = () => useWindowDimensions().fontScale >= stackFromFontScale;

// A step's few words, cut at eight with an ellipsis.
function shortQuote(text: string): string {
  const words = text.trim().split(/\s+/);
  return words.length <= 8 ? text.trim() : `${words.slice(0, 8).join(' ')}…`;
}

// ---- Step by step: your answer's steps next to the shorter version's.


export function StepByStep({ map, better, durationSeconds }: { map: AnswerMap; better: Coaching['betterSteps']; durationSeconds: number }) {
  const stacked = useStacked();
  return (
    <>
      <Text variant="body" color="textSecondary">
        {stepByStepIntro(map, better)}
      </Text>
      <View style={[styles.columns, stacked && styles.stacked]}>
        <MapColumn title="Yours" durationSeconds={durationSeconds} steps={map.steps} stacked={stacked} />
        {better && better.length > 0 ? (
          <View style={[styles.column, !stacked && styles.flex]}>
            <Text variant="label">Shorter and clearer</Text>
            {better.map((step, i) => (
              // The shorter version has no real times, so its steps carry none (DESIGN.md).
              <View key={i} style={styles.step}>
                <Text variant="body" strong>
                  {labelName[step.label]}
                </Text>
                <Text variant="label" color="textPrimary">
                  {curly(`"${shortQuote(step.text)}"`)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </>
  );
}

// ---- Both maps (the before-and-after): two real tries side by side, both with their times.

type Try = { title: string; map: AnswerMap; durationSeconds: number };

export function BothMaps({ first, latest }: { first: Try; latest: Try }) {
  const stacked = useStacked();
  return (
    <View style={[styles.columns, stacked && styles.stacked]}>
      <MapColumn title={first.title} durationSeconds={first.durationSeconds} steps={first.map.steps} stacked={stacked} />
      <MapColumn title={latest.title} durationSeconds={latest.durationSeconds} steps={latest.map.steps} stacked={stacked} />
    </View>
  );
}

// One real try's steps: each with its time, its label and its opening words (when the map has them).
function MapColumn({ title, durationSeconds, steps, stacked }: { title: string; durationSeconds: number; steps: AnswerMap['steps']; stacked: boolean }) {
  return (
    <View style={[styles.column, !stacked && styles.flex]}>
      <Text variant="label">
        {`${title} · `}
        <Text variant="label" tabular>
          {clock(durationSeconds)}
        </Text>
      </Text>
      {steps.map((step) => (
        <View key={step.sentence} style={styles.step}>
          <Text variant="label" tabular>
            {clock(step.atSeconds)}
          </Text>
          <Text variant="body" strong>
            {labelName[step.label]}
          </Text>
          {step.opening ? (
            <Text variant="label" color="textPrimary">
              {curly(`"${shortQuote(step.opening)}"`)}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

// ---- Shorter and clearer: what changed, then the better version.

export function Shorter({ coaching }: { coaching: Coaching }) {
  const changed = coaching.whatChanged ? ` ${coaching.whatChanged.trim()}` : '';
  return (
    <>
      <Text variant="body" color="textSecondary">
        {curly(`Your own answer, rewritten.${changed} Nothing new was added.`)}
      </Text>
      <Text variant="betterVersion">{curly(coaching.betterVersion)}</Text>
    </>
  );
}

// ---- How it sounded: one row per moment, each with its time button.

export function Sounded({ lines, onPlay }: { lines: SoundedLine[]; onPlay: ((atSeconds: number) => void) | null }) {
  const stacked = useStacked();
  const anyTime = onPlay !== null && lines.some((l) => l.atSeconds !== null);
  return (
    <>
      <Text variant="body" color="textSecondary">
        {`Pauses and repeats are counted from your recording. The AI listener picked the ones a person would notice.${anyTime ? ' Tap a time to hear it.' : ''}`}
      </Text>
      {lines.map((line, i) => (
        <View key={i} style={[styles.moment, stacked && styles.stacked]}>
          {onPlay && line.atSeconds !== null ? <TimeButton atSeconds={line.atSeconds} onPlay={onPlay} /> : null}
          <View style={!stacked && styles.flex}>
            <Text variant="body">{curly(line.text)}</Text>
          </View>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', gap: space.xl },
  column: { gap: space.lg },
  stacked: { flexDirection: 'column' },
  step: { gap: space.xs },
  moment: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  flex: { flex: 1 },
});
