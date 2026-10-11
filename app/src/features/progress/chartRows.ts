import type { Averages, DayPoint } from './daySeries';

// The three rows of the chart. Each has its own scale, because filler words, speed and clear point share no unit.
export type ChartRow = {
  id: 'fillers' | 'speed' | 'clearPoint';
  title: string;
  pick: (d: DayPoint) => number | null;
  pickAverage: (a: Averages) => number | null;
  // How a value reads next to the line, and in the spoken summary.
  format: (v: number) => string;
};

const whole = (v: number) => String(Math.round(v));
const half = (v: number) => String(Math.round(v * 2) / 2);

export const chartRows: ChartRow[] = [
  { id: 'fillers', title: 'Filler words', pick: (d) => d.fillersPerMinute, pickAverage: (a) => a.fillersPerMinute, format: (v) => `${whole(v)} a minute` },
  { id: 'speed', title: 'Speed', pick: (d) => d.wordsPerMinute, pickAverage: (a) => a.wordsPerMinute, format: (v) => `${whole(v)} words a minute` },
  { id: 'clearPoint', title: 'Clear point', pick: (d) => d.clearPoint, pickAverage: (a) => a.clearPoint, format: (v) => `${half(v)} of 6` },
];

const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const dayLetters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// The chart in words, for VoiceOver: one sentence per row, only the days that have a value.
export function chartSummary(series: DayPoint[], start: Averages | null): string {
  return chartRows
    .map((row) => {
      const parts = series.flatMap((d, i) => {
        const v = row.pick(d);
        return v === null ? [] : [`${dayNames[i]} ${row.format(v)}`];
      });
      const was = start ? row.pickAverage(start) : null;
      const startPart = was === null ? '' : `. Your starting point was ${row.format(was)}`;
      return parts.length === 0 ? `${row.title}: nothing scored yet` : `${row.title}: ${parts.join(', ')}${startPart}`;
    })
    .join('. ');
}
