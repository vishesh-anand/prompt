import { z } from 'npm:zod@4';

// The five labels a step of an answer can have. Defined in prompts/map.ts.
export const stepLabels = ['direction', 'point', 'support', 'off_track', 'ending'] as const;
export type StepLabel = (typeof stepLabels)[number];

const quote = z.string().describe('Exact words from the transcript, copied word for word with filler words kept, never a [pause] mark');

const step = z.object({
  label: z.enum(stepLabels),
  startsWith: quote.describe("The step's first 3 to 8 words, copied exactly from the transcript"),
});

// What the Map stage asks the model for. It holds no counts and no times: plain code works those out from the quotes.
export const mapOutputSchema = z.object({
  steps: z.array(step).min(1).describe('The answer as steps, in the order they were said, covering all of it'),
  point: z.object({
    restatement: z.string().describe('The point in one sentence, as a first-time listener understood it, said back to the speaker as "you"'),
    quote: z.string().describe('The exact words where the point is said, or an empty string when there is no single point'),
  }),
  didntFollow: z.array(z.object({ quote, why: z.string().describe('One short sentence') })).describe('Moments where a listener lost the thread; empty if none'),
  restarts: z.array(z.object({ quote })).describe('Sentences dropped and begun again; empty if none'),
  noticed: z
    .array(
      z.object({
        kind: z.enum(['fillers', 'pause', 'repeat', 'hedge', 'pattern']),
        quote,
        why: z.string().describe('One short sentence on why a listener would notice it'),
      }),
    )
    .describe('Only what a listener would notice; empty for a clean answer'),
  effort: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
    .describe('How much effort it took to follow, 1 = no effort at all, 5 = hard work'),
});

export type MapOutput = z.infer<typeof mapOutputSchema>;

// What is saved on the answer row: the model's map, plus what plain code worked out from it. Times are seconds from the
// first spoken word. `version` is the map prompt's version (not in pipeline_version, which the live pipeline rewrites).
export const savedMapSchema = mapOutputSchema.extend({
  version: z.number(),
  steps: z.array(step.extend({ atSeconds: z.number() })).min(1),
  // When the listener first knew where the answer was going: the first Direction or Point step. Null when there is none.
  pointAtSeconds: z.number().nullable(),
  // The share of the time spoken (0 to 1) that is in Off track steps.
  offTrackShare: z.number(),
});

export type SavedMap = z.infer<typeof savedMapSchema>;
