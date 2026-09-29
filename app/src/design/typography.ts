// Source of truth: DESIGN.md "Lettering". Sizes are iOS defaults; Dynamic Type scales them up.
import type { TextStyle } from 'react-native';

import type { ColorToken } from './colors';

export type TextVariant = 'question' | 'bigNumber' | 'title' | 'body' | 'betterVersion' | 'label';

// Apple's built-in serif (New York). Only for the question, better version and weekly note.
const serif = 'ui-serif';

export const typography: Record<TextVariant, Pick<TextStyle, 'fontFamily' | 'fontSize' | 'fontWeight'>> = {
  question: { fontFamily: serif, fontSize: 28, fontWeight: '400' },
  bigNumber: { fontSize: 34, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '600' },
  body: { fontSize: 17, fontWeight: '400' },
  betterVersion: { fontFamily: serif, fontSize: 19, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '500' },
};

export const defaultTextColor: Record<TextVariant, ColorToken> = {
  question: 'textPrimary',
  bigNumber: 'textPrimary',
  title: 'textPrimary',
  body: 'textPrimary',
  betterVersion: 'textPrimary',
  label: 'textSecondary',
};
