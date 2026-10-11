export type Point = { x: number; y: number };

export type RowLayout = {
  // Pieces of the line. A day with no value ends one piece and starts the next, so a gap is never drawn across.
  segments: Point[][];
  // Every drawn dot, in day order.
  dots: Point[];
  // The faint dotted line for the starting point, or null when there is none.
  baselineY: number | null;
};

type Box = { width: number; height: number; padding: number };

// Lays one row of the chart out in a box. Each row has its own scale (filler words, speed and clear point share no unit),
// fitted to its values and the starting point, so the starting point is always inside the box.
// Higher values are higher on the screen; a flat row sits in the middle.
export function layoutRow(values: (number | null)[], baseline: number | null, { width, height, padding }: Box): RowLayout {
  const known = [...values, baseline].filter((v): v is number => v !== null && Number.isFinite(v));
  const low = known.length === 0 ? 0 : Math.min(...known);
  const high = known.length === 0 ? 0 : Math.max(...known);
  const innerW = Math.max(0, width - padding * 2);
  const innerH = Math.max(0, height - padding * 2);
  const y = (v: number) => (high === low ? height / 2 : padding + innerH - ((v - low) / (high - low)) * innerH);
  const x = (i: number) => (values.length <= 1 ? width / 2 : padding + (i / (values.length - 1)) * innerW);

  const segments: Point[][] = [];
  const dots: Point[] = [];
  let current: Point[] = [];
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      if (current.length > 0) segments.push(current);
      current = [];
      return;
    }
    const point = { x: x(i), y: y(v) };
    current.push(point);
    dots.push(point);
  });
  if (current.length > 0) segments.push(current);

  return { segments, dots, baselineY: baseline === null ? null : y(baseline) };
}
