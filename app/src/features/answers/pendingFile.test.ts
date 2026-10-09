import { parsePending, serializePending } from './pendingFile';

const first = { answerId: 'a1', userId: 'u1', questionId: 7, durationMs: 31_000, retryOf: null };

describe('the details file kept next to a recording on the phone', () => {
  it('still reads files saved before retries existed, as a first attempt', () => {
    const old = JSON.stringify({ answerId: 'a1', userId: 'u1', questionId: 7, durationMs: 31_000 });
    expect(parsePending(old)).toEqual(first);
  });

  it('remembers which first attempt a retry belongs to', () => {
    const retry = { ...first, answerId: 'a2', retryOf: 'a1' };
    expect(parsePending(serializePending(retry))).toEqual(retry);
  });

  it('round-trips a first attempt', () => {
    expect(parsePending(serializePending(first))).toEqual(first);
  });

  it('refuses a file that is not a pending answer, so the recording is left alone', () => {
    expect(() => parsePending('{"answerId":"a1"}')).toThrow();
    expect(() => parsePending('not json')).toThrow();
  });
});
