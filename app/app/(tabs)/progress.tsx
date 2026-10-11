import { StyleSheet, View } from 'react-native';

import { Button, Screen, Stat, Text, space } from '@/design';
import { ProgressChart } from '@/features/progress/ProgressChart';
import { noteMessage, startMessage } from '@/features/progress/progressView';
import { useRefreshOnShow } from '@/features/progress/useRefreshOnShow';
import { useProgress } from '@/features/progress/useProgress';

// Streak, this week's chart, the weekly coach note, and how you compare with your first answer.
export default function Progress() {
  const p = useProgress();
  const { refresh } = p;

  // New scores can land while you are on another screen, so look again each time this tab is shown again.
  useRefreshOnShow(refresh);

  const noteText = noteMessage(p.noteView);

  return (
    <Screen scroll>
      <View style={styles.page}>
        <Text variant="title">Progress</Text>

        {p.loadFailed ? (
          <View style={styles.block}>
            <Text variant="body">{"Your progress didn't load. Check your connection and try again."}</Text>
            <Button label="Try again" onPress={p.reload} />
          </View>
        ) : !p.loaded ? null : (
          <>
            <View
              style={styles.block}
              accessible
              accessibilityLabel={p.streak.days === 0 ? 'No streak yet' : `Streak: ${p.streak.days} ${p.streak.days === 1 ? 'day' : 'days'} in a row`}>
              {p.streak.days === 0 ? (
                <Text variant="label">{"Your streak starts with today's answer."}</Text>
              ) : (
                <>
                  <Text variant="bigNumber" color="accentText">
                    {p.streak.days}
                  </Text>
                  <Text variant="label">{p.streak.days === 1 ? 'day in a row' : 'days in a row'}</Text>
                </>
              )}
            </View>

            <View style={styles.block}>
              <Text variant="label">This week</Text>
              {p.practicedThisWeek ? (
                <ProgressChart series={p.series} start={p.startNumbers} />
              ) : (
                <Text variant="body" color="textSecondary">
                  {"Your chart for this week starts with today's answer."}
                </Text>
              )}
            </View>

            <View style={styles.block}>
              <Text variant="label">Weekly note</Text>
              {p.noteView.kind === 'note' ? (
                <Text variant="betterVersion">{p.noteView.text}</Text>
              ) : noteText !== null ? (
                <Text variant="body" color="textSecondary">
                  {noteText}
                </Text>
              ) : null}
            </View>

            <View style={styles.block}>
              <Text variant="label">Since your first answer</Text>
              <SinceStart {...p} />
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

function SinceStart({ start, comparison }: Pick<ReturnType<typeof useProgress>, 'start' | 'comparison'>) {
  const message = startMessage(start, comparison?.kind ?? null);
  if (message === '') return null;
  if (message !== null) {
    return (
      <Text variant="body" color="textSecondary">
        {message}
      </Text>
    );
  }
  if (comparison?.kind !== 'rows') return null;
  return (
    <View style={styles.block}>
      {comparison.rows.map((row) => (
        <View key={row.id} style={styles.stat}>
          <Stat
            label={row.label}
            value={row.after}
            change={row.improved ? { direction: row.arrow, text: row.line } : undefined}
          />
          {row.improved ? null : <Text variant="label">{row.line}</Text>}
          <Text variant="label">{`Starting point: ${row.before}`}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: space.xxl },
  block: { gap: space.md },
  stat: { gap: space.xs },
});
