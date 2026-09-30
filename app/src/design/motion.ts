// Source of truth: DESIGN.md "Movement" and "Recording screen". Timings in ms, scales are multipliers.

export const recordingMotion = {
  // How often we ask the recorder for the current loudness.
  meterIntervalMs: 40,
  // Loudness range (decibels) that maps to 0..1. Measured on an iPhone: room silence -47 to -37, talking -35 to -10, loud -15 to -2.
  meterFloorDb: -38,
  meterCeilingDb: -8,
  // Above 1 keeps normal talking modest so louder speech stands out.
  levelCurve: 1.6,
  // Breathing: rise quickly with the voice, settle slowly in silence.
  levelRiseMs: 90,
  levelFallMs: 450,
  coreMaxScale: 1.2,
  glowRestScale: 1.1,
  glowMaxScale: 1.8,
  // Reduce Motion: the halo stays this size, and the coral circle fades between this opacity and full.
  reducedGlowScale: 1.4,
  reducedCoreRestOpacity: 0.55,
} as const;
