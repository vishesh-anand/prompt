import type { QueryClient } from '@tanstack/react-query';

// Everything worked out from your answers: the streak and questions seen (history), the chart and starting point
// (progress), and the profile, which holds your starting point (the database sets and can replace it after an answer).
// The weekly note is not here: Progress asks for it each time it is shown, so a hidden tab never pays for a note.
export function invalidateAnswers(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['history'] }),
    queryClient.invalidateQueries({ queryKey: ['progress'] }),
    queryClient.invalidateQueries({ queryKey: ['profile'] }),
  ]);
}
