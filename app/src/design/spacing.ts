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

// Every tap target is at least 44 points tall (Apple's minimum). Quiet buttons are capsules: fully rounded at that height.
export const tapTarget = 44;
export const capsuleRadius = tapTarget / 2;

// The answer line (DESIGN.md, Feedback reveal and Before and after): one bar, a rounded segment per step, 3 apart;
// outlined segments use a 1.5 line. 10 tall on the feedback screen, 12 on the before-and-after.
export const answerLine = { height: 10, compareHeight: 12, gap: 3, outline: 1.5 } as const;
