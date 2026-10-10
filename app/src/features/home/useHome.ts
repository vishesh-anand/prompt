import { useState } from 'react';

import { useHistory } from '@/features/history/useHistory';
import { useProfile } from '@/features/profile/useProfile';
import { defaultCategory, pickQuestion, type Category } from '@/features/questions/pickQuestion';
import { useQuestions } from '@/features/questions/useQuestions';
import { streak } from '@/features/streak/streak';

export const categoryOptions: { value: Category; label: string }[] = [
  { value: 'work', label: 'Work' },
  { value: 'everyday', label: 'Everyday conversation' },
];

// Test-only buttons. EXPO_PUBLIC_E2E is baked into the scripted-test build; normal builds never set it.
export const showTestTools = __DEV__ || process.env.EXPO_PUBLIC_E2E === '1';

// Everything Home needs: which kind of question, today's question, the streak, and whether any of it could be loaded.
export function useHome() {
  const profile = useProfile();
  const questions = useQuestions();
  const history = useHistory();
  const [chosen, setChosen] = useState<Category | null>(null);

  // The question and streak come from your answers and your setup, so nothing is shown until all three have loaded: with an
  // empty list a long streak would read as none, and a question you already answered would come up again. A failed
  // refresh that leaves good data on screen is not an error.
  const loaded = profile.data !== undefined && questions.data !== undefined && history.data !== undefined;
  const loadFailed = !loaded && (profile.isError || questions.isError || history.isError);

  const answers = history.data ?? [];
  const category = chosen ?? defaultCategory(questions.data ?? [], answers);
  const question = loaded ? pickQuestion(questions.data, answers, category) : null;

  return {
    // null while the profile is loading; true when first-time setup hasn't happened.
    needsSetup: profile.data === undefined ? null : profile.data.reminder_time === null,
    profileLoading: profile.isPending,
    loaded,
    loadFailed,
    reload: () => {
      void profile.refetch();
      void questions.refetch();
      void history.refetch();
    },
    category,
    chooseCategory: setChosen,
    question,
    streak: streak(answers, new Date()),
  };
}
