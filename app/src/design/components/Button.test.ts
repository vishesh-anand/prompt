import { labelLines } from './Button';

// iPhone width, in points.
const width = 402;

describe('how many lines a button label gets', () => {
  it('one line at the default text size, for every label in the app', () => {
    for (const label of ['Try again', 'Try again with this tip', 'See before and after', 'Record again', 'This feedback is wrong']) {
      expect([label, labelLines(label, 1, width)]).toEqual([label, 1]);
    }
  });

  it('more lines as the text grows, never more than three, never fewer than one', () => {
    expect(labelLines('Try again with this tip', 2, width)).toBe(2);
    expect(labelLines('Try again with this tip', 3.1, width)).toBe(3);
    expect(labelLines('Try again with this tip and a very long second part of the label', 3.1, width)).toBe(3);
    expect(labelLines('', 1, width)).toBe(1);
  });
});
