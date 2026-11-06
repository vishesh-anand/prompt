// Source of truth: DESIGN.md "Lettering". Sizes are iOS defaults; Dynamic Type scales them up.
import type { TextStyle } from 'react-native';

import type { ColorToken } from './colors';

export type TextVariant =
  | 'largeTitle'
  | 'question'
  | 'bigNumber'
  | 'title'
  | 'headline'
  | 'body'
  | 'betterVersion'
  | 'subheadline'
  | 'label'
  | 'caption';

// Apple's built-in serif (New York). Only for the question, better version and weekly note.
const serif = 'ui-serif';

type Style = Pick<TextStyle, 'fontFamily' | 'fontSize' | 'fontWeight' | 'lineHeight' | 'fontVariant'>;

export const typography: Record<TextVariant, Style> = {
  // The name of each top-level screen, in the same place every time.
  largeTitle: { fontSize: 34, fontWeight: '700' },
  question: { fontFamily: serif, fontSize: 28, fontWeight: '400' },
  // Digits only: a word at 34pt looks like a mistake. Figures keep one width so counts don't jiggle.
  bigNumber: { fontSize: 34, fontWeight: '600', fontVariant: ['tabular-nums'] },
  title: { fontSize: 22, fontWeight: '600' },
  // A long, important line (the tip): weight without the size of a title.
  headline: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 17, fontWeight: '400' },
  // Long reading text, so it gets about 1.4x leading instead of the font's natural 1.2x.
  betterVersion: { fontFamily: serif, fontSize: 19, fontWeight: '400', lineHeight: 27 },
  subheadline: { fontSize: 15, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '500' },
  caption: { fontSize: 12, fontWeight: '400' },
};

export const defaultTextColor: Record<TextVariant, ColorToken> = {
  largeTitle: 'textPrimary',
  question: 'textPrimary',
  bigNumber: 'textPrimary',
  title: 'textPrimary',
  headline: 'textPrimary',
  body: 'textPrimary',
  betterVersion: 'textPrimary',
  subheadline: 'textSecondary',
  label: 'textSecondary',
  caption: 'textSecondary',
};
