import type { DayPoint } from './daySeries';

// Made-up weeks for the design preview (development only), so the chart can be checked in both modes without recording anything.
const day = (i: number, v: Partial<DayPoint> | null): DayPoint => ({
  key: `2026-10-0${5 + i}`,
  practiced: v !== null,
  fillersPerMinute: v?.fillersPerMinute ?? null,
  wordsPerMinute: v?.wordsPerMinute ?? null,
  clearPoint: v?.clearPoint ?? null,
});

const start = { fillersPerMinute: 14, wordsPerMinute: 190, clearPoint: 2 };

export const progressSamples = [
  {
    name: 'Improving, five days',
    start,
    series: [
      day(0, { fillersPerMinute: 12, wordsPerMinute: 185, clearPoint: 2.5 }),
      day(1, { fillersPerMinute: 10, wordsPerMinute: 178, clearPoint: 3 }),
      day(2, null),
      day(3, { fillersPerMinute: 7, wordsPerMinute: 165, clearPoint: 4 }),
      day(4, { fillersPerMinute: 5, wordsPerMinute: 158, clearPoint: 4.5 }),
      day(5, { fillersPerMinute: 4, wordsPerMinute: 150, clearPoint: 5 }),
      day(6, null),
    ],
  },
  {
    name: 'Flat, all the same',
    start: { fillersPerMinute: 6, wordsPerMinute: 140, clearPoint: 3 },
    series: [0, 1, 2].map((i) => day(i, { fillersPerMinute: 6, wordsPerMinute: 140, clearPoint: 3 })).concat([3, 4, 5, 6].map((i) => day(i, null))),
  },
  {
    name: 'One day, no starting point yet',
    start: null,
    series: [0, 1, 2, 3, 4, 5, 6].map((i) => day(i, i === 2 ? { fillersPerMinute: 9, wordsPerMinute: 130, clearPoint: 3 } : null)),
  },
];
