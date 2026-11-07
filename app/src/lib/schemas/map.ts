import { z } from 'zod';

// The parts of the saved map the feedback screen reads. Same shape as supabase/functions/_shared/schemas/map.ts
// (savedMapSchema); fields the phone doesn't use are left out and dropped. Times are seconds from the first spoken word.
// The fields marked "step D2" are missing on maps saved before step D2 (until `npm run map:moments` adds them), and on
// those the screen shows no time button or step quote.
export const stepLabels = ['direction', 'point', 'support', 'off_track', 'ending'] as const;
export type StepLabel = (typeof stepLabels)[number];

const atSeconds = z.number().optional();

export const mapSchema = z.object({
  // The map prompt's version. The lost-thread line is only written in the screen's voice from version 9.
  version: z.number(),
  point: z.object({ restatement: z.string() }),
  steps: z.array(z.object({ label: z.enum(stepLabels), sentence: z.number(), atSeconds: z.number(), opening: z.string().optional() })).min(1),
  pointAtSeconds: z.number().nullable(),
  offTrackShare: z.number(),
  // Where the first word starts in the recording: add it to a map time to play from that moment (step D2).
  firstWordAtSeconds: z.number().optional(),
  didntFollow: z.array(z.object({ quote: z.string(), why: z.string(), atSeconds })),
  restarts: z.array(z.object({ quote: z.string(), atSeconds })),
  noticed: z.array(
    z.object({
      kind: z.enum(['fillers', 'pause', 'repeat', 'hedge', 'pattern']),
      quote: z.string(),
      why: z.string(),
      // Only a pattern has its own next step (map prompt v9); the other kinds get a fixed one on the phone.
      nextStep: z.string().optional(),
      atSeconds,
    }),
  ),
});

export type AnswerMap = z.infer<typeof mapSchema>;
