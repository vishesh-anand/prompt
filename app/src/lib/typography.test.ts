import { clock } from './clock';
import { curly } from './typography';

describe('curly quotes', () => {
  it('turns apostrophes and quotes into typographic ones', () => {
    expect(curly("You said 'basically' 6 times. That's a habit.")).toBe('You said ‘basically’ 6 times. That’s a habit.');
    expect(curly('You started with "So I think, well…"')).toBe('You started with “So I think, well…”');
    expect(curly("The team's plan.")).toBe('The team’s plan.');
    expect(curly('("quoted")')).toBe('(“quoted”)');
  });

  it('leaves text that is already typographic alone', () => {
    expect(curly('That’s what I meant')).toBe('That’s what I meant');
  });
});

describe('clock', () => {
  it('shows minutes and seconds, rounded', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(6.4)).toBe('0:06');
    expect(clock(69.6)).toBe('1:10');
    expect(clock(112)).toBe('1:52');
    expect(clock(-1)).toBe('0:00');
  });
});
