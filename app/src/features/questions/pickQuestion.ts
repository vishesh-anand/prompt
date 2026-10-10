import type { Question } from '@/lib/schemas/question';

type Past = { question_id: number; retry_of: string | null };

export type Category = Question['category'];

// How many times you answered each question for the first time. A retry is the same question again, so it doesn't count.
function timesSeen(history: Past[]): Map<number, number> {
  const seen = new Map<number, number>();
  for (const answer of history) {
    if (answer.retry_of === null) seen.set(answer.question_id, (seen.get(answer.question_id) ?? 0) + 1);
  }
  return seen;
}

// The next question in a category: one you haven't answered, in order. Once you've answered them all, the one you've
// answered least, so nothing repeats until you've seen every question. `questions` is the active ones only.
export function pickQuestion(questions: Question[], history: Past[], category: Category): Question | null {
  const seen = timesSeen(history);
  let best: Question | null = null;
  let bestCount = Infinity;
  for (const question of questions) {
    if (question.category !== category) continue;
    const count = seen.get(question.id) ?? 0;
    if (count < bestCount || (count === bestCount && best !== null && question.id < best.id)) {
      best = question;
      bestCount = count;
    }
  }
  return best;
}

// Start on the kind you practiced last; a new person starts on Work.
export function defaultCategory(questions: Question[], history: (Past & { created_at: string })[]): Category {
  const byId = new Map(questions.map((q) => [q.id, q]));
  let latest: { at: number; category: Category } | null = null;
  for (const answer of history) {
    const question = byId.get(answer.question_id);
    if (!question || answer.retry_of !== null) continue;
    const at = Date.parse(answer.created_at);
    if (latest === null || at > latest.at) latest = { at, category: question.category };
  }
  return latest?.category ?? 'work';
}
