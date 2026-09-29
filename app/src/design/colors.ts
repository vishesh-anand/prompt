// Source of truth: DESIGN.md "Colors". Screens use these by name, never raw values.

export type ColorToken =
  | 'background'
  | 'surface'
  | 'textPrimary'
  | 'textSecondary'
  | 'accent'
  | 'onAccent'
  | 'accentText'
  | 'accentSoft'
  | 'positive'
  | 'divider';

export type Palette = Record<ColorToken, string>;

export const light: Palette = {
  background: '#FBF8F4',
  surface: '#FFFFFF',
  textPrimary: '#1F1B16',
  textSecondary: '#6B645C',
  accent: '#E8643C',
  onAccent: '#1F1B16',
  accentText: '#B8461F',
  accentSoft: 'rgba(232, 100, 60, 0.15)',
  positive: '#2F7549',
  divider: '#ECE6DE',
};

export const dark: Palette = {
  background: '#16130F',
  surface: '#221E19',
  textPrimary: '#F3EEE8',
  textSecondary: '#A39B91',
  accent: '#F07A52',
  onAccent: '#16130F',
  accentText: '#F59A78',
  accentSoft: 'rgba(240, 122, 82, 0.2)',
  positive: '#6BBF8A',
  divider: '#2E2923',
};
