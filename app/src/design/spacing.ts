// Source of truth: DESIGN.md "Spacing and shape". Nothing in between these steps.

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export type Space = keyof typeof space;

export const screenMargin = 24;

export const radius = {
  card: 16,
  button: 12,
} as const;

export const recordButtonSize = 88;

// The recording circle. The ring sits `space.md` outside the core at its biggest, so they never overlap.
export const recordCircle = {
  core: 176,
  ringStroke: 3,
} as const;
