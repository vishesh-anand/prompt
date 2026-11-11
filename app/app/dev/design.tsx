import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  Screen,
  Stat,
  Text,
  radius,
  space,
  useTheme,
  type ColorToken,
  type Space,
  type TextVariant,
} from '@/design';
import { CompareView } from '@/features/compare/CompareView';
import { compareSamples } from '@/features/compare/samples';
import { feedbackSamples } from '@/features/feedback/samples';
import { ProgressChart } from '@/features/progress/ProgressChart';
import { progressSamples } from '@/features/progress/samples';

// Development only: shows every token and component. Testers never see it.
// To check dark mode, flip Appearance in Control Center.

const colorTokens: ColorToken[] = [
  'background',
  'surface',
  'textPrimary',
  'textSecondary',
  'accent',
  'onAccent',
  'accentText',
  'accentSoft',
  'positive',
  'divider',
  'fill',
];

const typeSamples: { variant: TextVariant; sample: string }[] = [
  { variant: 'largeTitle', sample: 'Progress' },
  { variant: 'question', sample: 'Tell me about a time you changed your mind.' },
  { variant: 'bigNumber', sample: '12' },
  { variant: 'title', sample: 'Your answer' },
  { variant: 'headline', sample: 'Next time, tell the listener where you are going in your first sentence.' },
  { variant: 'body', sample: 'You said "basically" 6 times. Try a short pause instead.' },
  { variant: 'betterVersion', sample: 'I changed my mind about remote work after our second quarter.' },
  { variant: 'subheadline', sample: 'How it sounded' },
  { variant: 'label', sample: 'Filler words' },
  { variant: 'caption', sample: 'At 0:40' },
];

const spaceSteps = Object.keys(space) as Space[];

export default function DesignPreview() {
  const { colors, scheme } = useTheme();
  const router = useRouter();

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <Screen scroll>
      <View style={styles.page}>
        <Text variant="title">Design preview ({scheme})</Text>

        <Section title="Colors">
          <Card>
            {colorTokens.map((token) => (
              <View key={token} style={styles.row}>
                <View style={[styles.swatch, { backgroundColor: colors[token], borderColor: colors.divider }]} />
                <View>
                  <Text variant="body">{token}</Text>
                  <Text variant="label">{colors[token]}</Text>
                </View>
              </View>
            ))}
          </Card>
        </Section>

        <Section title="Type">
          {typeSamples.map(({ variant, sample }) => (
            <View key={variant} style={styles.type}>
              <Text variant="label">{variant}</Text>
              <Text variant={variant}>{sample}</Text>
            </View>
          ))}
        </Section>

        <Section title="Spacing">
          {spaceSteps.map((step) => (
            <View key={step} style={styles.row}>
              <View style={[styles.bar, { width: space[step], backgroundColor: colors.accentSoft }]} />
              <Text variant="label">{`${step} · ${space[step]}`}</Text>
            </View>
          ))}
        </Section>

        <Section title="Buttons">
          <Button label="Try again" onPress={() => {}} />
          <Button variant="secondary" label="Play recording" onPress={() => {}} />
        </Section>

        <Section title="Card and Stat">
          <Card>
            <Stat value="4" label="Filler words" change={{ direction: 'down', text: '5 fewer filler words' }} />
          </Card>
          <Card>
            <Stat value="12 days" label="Streak" />
          </Card>
        </Section>

        <Section title="Feedback screen">
          {feedbackSamples.map((sample, i) => (
            <Button key={sample.name} variant="secondary" label={sample.name} onPress={() => router.push({ pathname: '/dev/feedback', params: { sample: String(i) } })} />
          ))}
        </Section>

        <Section title="Before and after">
          {compareSamples.map((sample) => (
            <View key={sample.name} style={styles.compareSample}>
              <Text variant="label">{sample.name}</Text>
              <CompareView instruction={sample.instruction} rows={sample.rows} summary={sample.summary} />
            </View>
          ))}
        </Section>

        <Section title="Progress chart">
          {progressSamples.map((sample) => (
            <View key={sample.name} style={styles.compareSample}>
              <Text variant="label">{sample.name}</Text>
              <ProgressChart series={sample.series} start={sample.start} />
            </View>
          ))}
        </Section>
      </View>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="label" color="accentText">
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: space.xxl },
  section: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  swatch: { width: space.xxxl, height: space.xl, borderRadius: radius.button, borderWidth: 1 },
  bar: { height: space.sm },
  type: { gap: space.xs },
  compareSample: { gap: space.xl, paddingBottom: space.xxl },
});
