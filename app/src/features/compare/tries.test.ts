import { isFirstRetry, tryLabel, tryNumber } from './tries';

const row = (id: string, retry_of: string | null, minute: number) => ({ id, question_id: 1, retry_of, created_at: `2026-11-12T10:${String(minute).padStart(2, '0')}:00Z` });
// Newest first, as useHistory returns it.
const history = [row('c', 'a', 30), row('x', null, 20), row('b', 'a', 10), row('a', null, 5), row('old', 'z', 1), row('z', null, 0)];

describe('which try this is', () => {
  it('a first attempt is the first try', () => expect(tryNumber(history, { id: 'a', retry_of: null })).toBe(1));
  it('retries count up on their question', () => {
    expect(tryNumber(history, { id: 'b', retry_of: 'a' })).toBe(2);
    expect(tryNumber(history, { id: 'c', retry_of: 'a' })).toBe(3);
  });
  it('a retry the history doesn’t have yet is the second try', () => {
    expect(tryNumber(undefined, { id: 'n', retry_of: 'a' })).toBe(2);
    expect(tryNumber(history, { id: 'n', retry_of: 'a' })).toBe(2);
  });
  it('says it in words', () => {
    expect(tryLabel(2)).toBe('second try');
    expect(tryLabel(3)).toBe('third try');
    expect(tryLabel(12)).toBe('12th try');
  });
});

describe('the first retry ever', () => {
  it('is the earliest retry in the whole history', () => {
    expect(isFirstRetry(history, { id: 'old', retry_of: 'z' })).toBe(true);
    expect(isFirstRetry(history, { id: 'b', retry_of: 'a' })).toBe(false);
  });
  it('is never a first attempt, and not when history is unknown', () => {
    expect(isFirstRetry(history, { id: 'a', retry_of: null })).toBe(false);
    expect(isFirstRetry(undefined, { id: 'b', retry_of: 'a' })).toBe(false);
  });
});
