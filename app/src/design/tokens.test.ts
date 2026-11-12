// The design system artifact keeps its own copy of these tokens (design-system/tokens.json). This fails when the
// app's values and that copy drift apart. Fix the copy, then republish it to the artifact.
import tokens from '../../../design-system/tokens.json';

import { dark, light, type ColorToken } from './colors';
import { answerLine, radius, recordButtonSize, recordCircle, screenMargin, space, tapTarget } from './spacing';
import { typography, type TextVariant } from './typography';

type Entry = { name: string; value: string };

const css = (value: string) => value.toLowerCase().replace(/\s+/g, '');
const px = (value: string) => Number(value.replace(/px$/, ''));
const byName = (entries: Entry[]) => Object.fromEntries(entries.map((e) => [e.name, e.value]));

describe('design-system/tokens.json', () => {
  it('has the same colors as colors.ts, in both themes', () => {
    const copy = Object.fromEntries(tokens.color.tokens.map((t) => [t.name, t.value]));
    expect(Object.keys(copy).sort()).toEqual(Object.keys(light).sort());
    for (const name of Object.keys(light) as ColorToken[]) {
      expect([name, css(copy[name]?.light ?? '')]).toEqual([name, css(light[name])]);
      expect([name, css(copy[name]?.dark ?? '')]).toEqual([name, css(dark[name])]);
    }
  });

  it('has the same text styles as typography.ts', () => {
    const groups = tokens.type.groups;
    const styles = groups.flatMap((g) => g.styles.map((s) => ({ ...s, family: g.family })));
    expect(styles.map((s) => s.name).sort()).toEqual(Object.keys(typography).sort());
    for (const style of styles) {
      const code = typography[style.name as TextVariant];
      expect([style.name, px(style.fontSize)]).toEqual([style.name, code.fontSize]);
      expect([style.name, String(style.fontWeight)]).toEqual([style.name, code.fontWeight]);
      expect([style.name, style.family]).toEqual([style.name, code.fontFamily === 'ui-serif' ? 'serif' : 'sans']);
      // Only styles with a line height in the code carry one in px; the rest use the font's natural leading.
      if (code.lineHeight !== undefined) expect([style.name, px(String(style.lineHeight))]).toEqual([style.name, code.lineHeight]);
    }
  });

  it('has the same spacing, radii and sizes as spacing.ts', () => {
    const spacing = byName(tokens.spacing.tokens);
    const radii = byName(tokens.radius.tokens);
    const sizes = byName(tokens.size.tokens);
    const code = {
      ...Object.fromEntries(Object.entries(space).map(([key, value]) => [`space-${key}`, value])),
      'screen-margin': screenMargin,
    };
    expect(Object.keys(spacing).sort()).toEqual(Object.keys(code).sort());
    for (const [name, value] of Object.entries(code)) expect([name, px(spacing[name] ?? '')]).toEqual([name, value]);

    // radius-full (the circle) has no number in the code: it is half the circle's size.
    expect(px(radii['radius-button'] ?? '')).toBe(radius.button);
    expect(px(radii['radius-card'] ?? '')).toBe(radius.card);
    expect(px(sizes['record-button'] ?? '')).toBe(recordButtonSize);
    expect(px(sizes['record-circle-core'] ?? '')).toBe(recordCircle.core);
    expect(px(sizes['record-ring-stroke'] ?? '')).toBe(recordCircle.ringStroke);
    expect(px(sizes['tap-target'] ?? '')).toBe(tapTarget);
    expect(px(sizes['answer-line'] ?? '')).toBe(answerLine.height);
    expect(px(sizes['answer-line-compare'] ?? '')).toBe(answerLine.compareHeight);
    expect(px(sizes['answer-line-gap'] ?? '')).toBe(answerLine.gap);
    expect(px(sizes['answer-line-outline'] ?? '')).toBe(answerLine.outline);
  });
});
