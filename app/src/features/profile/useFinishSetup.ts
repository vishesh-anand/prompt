import { useRouter } from 'expo-router';

import { useHistory } from '@/features/history/useHistory';
import { pickQuestion } from '@/features/questions/pickQuestion';
import { useQuestions } from '@/features/questions/useQuestions';
import { dateToTime } from '@/features/reminders/timeOfDay';

import { useSaveReminder } from './useSaveReminder';

// First-time setup: save the reminder time, then go straight into the first answer (a Work question), which becomes the
// starting point. Home goes underneath it, so Done and the back swipe have somewhere to land.
export function useFinishSetup() {
  const router = useRouter();
  const save = useSaveReminder();
  const questions = useQuestions();
  const history = useHistory();

  function finish(time: Date) {
    // A second tap while the first is still saving would ask for permission and save twice.
    if (save.isPending) return;
    save.mutate(dateToTime(time), {
      onSuccess: async () => {
        // Continue can be tapped before these have loaded (a slow connection); ask again rather than skip your first question.
        const [list, answers] = await Promise.all([
          questions.data ?? questions.refetch().then((r) => r.data),
          history.data ?? history.refetch().then((r) => r.data),
        ]);
        const first = list ? pickQuestion(list, answers ?? [], 'work') : null;
        router.replace('/');
        if (first) router.push({ pathname: '/record', params: { questionId: String(first.id) } });
      },
    });
  }

  return { finish, saving: save.isPending, failed: save.isError };
}
