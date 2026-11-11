import { retryInstruction, tipSource } from './retryInstruction';

const id1 = '11111111-1111-4111-8111-111111111111';
const id2 = '22222222-2222-4222-8222-222222222222';

describe('which answer the retry instruction comes from', () => {
  it('is none on a first try', () => {
    expect(tipSource({ tipFrom: id2 }, null)).toBeNull();
  });

  it('is the answer the button was pressed on', () => {
    expect(tipSource({ tipFrom: id2 }, id1)).toBe(id2);
  });

  it('falls back to the first attempt when there is no valid id', () => {
    expect(tipSource({}, id1)).toBe(id1);
    expect(tipSource({ tipFrom: 'not-an-id' }, id1)).toBe(id1);
  });
});

describe('the retry instruction line', () => {
  it('lowers the first letter after "This time:"', () => {
    expect(retryInstruction('Say your point in your first sentence.')).toBe('This time: say your point in your first sentence.');
  });

  it('keeps "I" and acronyms capitalised', () => {
    expect(retryInstruction("I'd say it plainly.")).toBe('This time: I’d say it plainly.');
    expect(retryInstruction('AI listeners need the point early.')).toBe('This time: AI listeners need the point early.');
  });

  it('shows an older, longer tip whole', () => {
    const tip = 'Your point came at 1:10, after two passes around it. Next time, say it in your first sentence.';
    expect(retryInstruction(tip)).toBe(`This time: your point came at 1:10, after two passes around it. Next time, say it in your first sentence.`);
  });

  it('is nothing without a tip', () => {
    expect(retryInstruction(undefined)).toBeNull();
    expect(retryInstruction('  ')).toBeNull();
  });
});
