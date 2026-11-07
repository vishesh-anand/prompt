import { nextConfirmation } from './useConfirmListener';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('the listener tap', () => {
  it('a tap chooses that answer, and tapping the chosen one again undoes it', () => {
    expect(nextConfirmation(null, true)).toBe(true);
    expect(nextConfirmation(null, false)).toBe(false);
    expect(nextConfirmation(true, true)).toBeNull();
    expect(nextConfirmation(false, false)).toBeNull();
    expect(nextConfirmation(true, false)).toBe(false);
  });
});
