import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { invalidateAnswers } from '@/features/history/invalidateAnswers';
import { useHistory } from '@/features/history/useHistory';
import { useProfile } from '@/features/profile/useProfile';
import { streak } from '@/features/streak/streak';
import { useNow } from '@/features/streak/useNow';

import { compareToStart } from './compareToStart';
import { daySeries, weekAverages } from './daySeries';
import { noteView, startView } from './progressView';
import { useBaseline, useWeekAnswers } from './useWeekAnswers';
import { useWeeklyNote } from './useWeeklyNote';

// Everything the Progress screen shows, worked out from this week's answers, your starting point and the server's note.
export function useProgress() {
  const queryClient = useQueryClient();
  const now = useNow();
  const profile = useProfile();
  const history = useHistory();
  const week = useWeekAnswers(now);
  const baselineId = profile.data?.baseline_answer_id;
  const baseline = useBaseline(baselineId);
  const note = useWeeklyNote(now);

  // Stable between renders: the screen runs it from useFocusEffect, which would otherwise run again on every render.
  const refresh = useCallback(() => {
    void invalidateAnswers(queryClient);
    // Not cancelled if it is already running: that request may be the one paying for the note, and a second one would
    // only be told the note is not ready.
    void queryClient.invalidateQueries({ queryKey: ['weeklyNote'] }, { cancelRefetch: false });
  }, [queryClient]);

  const loaded = week.data !== undefined && history.data !== undefined && profile.data !== undefined;

  const series = daySeries(week.data ?? [], now);
  const practicedThisWeek = series.some((d) => d.practiced);
  const start = startView({ baselineId, loading: baseline.isPending, failed: baseline.isError, answer: baseline.data });
  const weekNumbers = weekAverages(series);

  return {
    loaded,
    // Any of the three failing with the screen still empty is a failure: say so and offer to retry.
    loadFailed: !loaded && (week.isError || history.isError || profile.isError),
    streak: streak(history.data ?? [], now),
    series,
    practicedThisWeek,
    startNumbers: start.kind === 'ready' ? start.numbers : null,
    start,
    comparison: start.kind === 'ready' ? compareToStart(start.numbers, weekNumbers) : null,
    noteView: noteView(note.data ?? null, note.isError && !note.isFetching),
    // Called when the tab is shown again: new scores may have landed while you were away.
    refresh,
    reload: () => {
      void profile.refetch();
      void history.refetch();
      void week.refetch();
      void note.refetch({ cancelRefetch: false });
    },
  };
}
