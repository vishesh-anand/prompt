// Sizes on the feedback screen that aren't spacing (DESIGN.md, Feedback reveal). Kept here, not in the design tokens,
// until a second screen needs them; then they move to app/src/design/spacing.ts and design-system/tokens.json.

// Every tap target is at least 44 points tall (Apple's minimum). Quiet buttons are capsules: fully rounded at that height.
export const tapTarget = 44;
export const capsuleRadius = tapTarget / 2;

// The answer line: one bar 10 tall, a rounded segment per step, 3 apart; outlined segments use a 1.5 line.
export const answerLine = { height: 10, gap: 3, outline: 1.5 } as const;
