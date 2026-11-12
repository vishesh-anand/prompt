import { isFirstRetry, previousTry, tryLabel, tryNumber } from './tries';

// The retries of question "a", oldest first.
const retries = [
  { id: 'b', created_at: '2026-11-12T10:10:00Z' },
  { id: 'c', created_at: '2026-11-12T10:30:00Z' },
];

describe('which try this is', () => {
  it('a first attempt is the first try', () => expect(tryNumber(retries, { id: 'a', retry_of: null })).toBe(1));
  it('retries count up on their question', () => {
    expect(tryNumber(retries, { id: 'b', retry_of: 'a' })).toBe(2);
    expect(tryNumber(retries, { id: 'c', retry_of: 'a' })).toBe(3);
  });
  it('a retry the rows don’t have yet is the newest', () => {
    expect(tryNumber(retries, { id: 'n', retry_of: 'a' })).toBe(4);
    expect(tryNumber(undefined, { id: 'n', retry_of: 'a' })).toBe(2);
  });
  it('says it in words', () => {
    expect(tryLabel(2)).toBe('second try');
    expect(tryLabel(3)).toBe('third try');
    expect(tryLabel(12)).toBe('12th try');
  });
});

describe('the try whose tip a retry carried', () => {
  it('is the first attempt for a second try, and the previous retry after that', () => {
    expect(previousTry(retries, { id: 'b', retry_of: 'a' })).toBe('a');
    expect(previousTry(retries, { id: 'c', retry_of: 'a' })).toBe('b');
  });
  it('for a retry the rows don’t have yet, the newest one they do', () => expect(previousTry(retries, { id: 'n', retry_of: 'a' })).toBe('c'));
  it('is the first attempt without rows', () => expect(previousTry(undefined, { id: 'c', retry_of: 'a' })).toBe('a'));
  it('is nothing for a first attempt', () => expect(previousTry(retries, { id: 'a', retry_of: null })).toBeNull());
});

describe('the first retry ever', () => {
  it('is the earliest retry', () => {
    expect(isFirstRetry('b', { id: 'b', retry_of: 'a' })).toBe(true);
    expect(isFirstRetry('b', { id: 'c', retry_of: 'a' })).toBe(false);
  });
  it('is never a first attempt, and not while unknown', () => {
    expect(isFirstRetry('a', { id: 'a', retry_of: null })).toBe(false);
    expect(isFirstRetry(undefined, { id: 'b', retry_of: 'a' })).toBe(false);
  });
});
