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
  | 'divider'
  | 'fill';

export type Palette = Record<ColorToken, string>;

export const light: Palette = {
  background: '#F5F1EB',
  surface: '#FFFFFF',
  textPrimary: '#1F1B16',
  textSecondary: '#6B645C',
  accent: '#E8643C',
  onAccent: '#1F1B16',
  accentText: '#B8461F',
  accentSoft: 'rgba(232, 100, 60, 0.15)',
  positive: '#2F7549',
  divider: '#ECE6DE',
  // Warm fill for controls (segmented track, quiet fills), so they never sit cool grey on the warm background.
  fill: '#ECE6DE',
};

export const dark: Palette = {
  background: '#16130F',
  surface: '#221E19',
  textPrimary: '#F3EEE8',
  textSecondary: '#A39B91',
  accent: '#F07A52',
  onAccent: '#16130F',
  accentText: '#F59A78',
  // Lower than light: at 20% the glow read as a muddy brown ring on the dark background.
  accentSoft: 'rgba(240, 122, 82, 0.12)',
  positive: '#6BBF8A',
  divider: '#2E2923',
  fill: '#2E2923',
};
