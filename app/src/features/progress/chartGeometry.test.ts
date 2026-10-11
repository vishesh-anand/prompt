import { layoutRow } from './chartGeometry';

const box = { width: 280, height: 56, padding: 8 };
const inside = (p: { x: number; y: number }) => p.x >= 0 && p.x <= box.width && p.y >= 0 && p.y <= box.height;

describe('layoutRow', () => {
  it('keeps every dot and the baseline inside the box', () => {
    const row = layoutRow([2, null, 9, 4, null, null, 15], 20, box);
    expect(row.dots.every(inside)).toBe(true);
    expect(row.baselineY).not.toBeNull();
    expect(row.baselineY as number).toBeGreaterThanOrEqual(0);
    expect(row.baselineY as number).toBeLessThanOrEqual(box.height);
  });

  it('puts higher values higher on the screen', () => {
    const row = layoutRow([2, 10], null, box);
    const [low, high] = row.dots;
    expect((high as { y: number }).y).toBeLessThan((low as { y: number }).y);
  });

  it('breaks the line at a day with no value', () => {
    const row = layoutRow([3, 4, null, 5, null, null, 6], null, box);
    expect(row.segments.map((s) => s.length)).toEqual([2, 1, 1]);
    expect(row.dots).toHaveLength(4);
  });

  it('places days left to right, Monday at the left edge of the padding and Sunday at the right', () => {
    const row = layoutRow([1, null, null, null, null, null, 2], null, box);
    expect(row.dots[0]?.x).toBe(box.padding);
    expect(row.dots[1]?.x).toBe(box.width - box.padding);
  });

  it('draws one value as one dot with no NaN', () => {
    const row = layoutRow([null, null, 7, null, null, null, null], null, box);
    expect(row.dots).toHaveLength(1);
    expect(Number.isNaN(row.dots[0]?.y)).toBe(false);
    expect(Number.isNaN(row.dots[0]?.x)).toBe(false);
  });

  it('draws equal values as a flat line in the middle', () => {
    const row = layoutRow([5, 5, 5, null, null, null, 5], 5, box);
    expect(row.dots.every((p) => p.y === box.height / 2)).toBe(true);
    expect(row.baselineY).toBe(box.height / 2);
  });

  it('is empty with no values and no baseline', () => {
    expect(layoutRow([null, null, null, null, null, null, null], null, box)).toEqual({ segments: [], dots: [], baselineY: null });
  });

  it('keeps a baseline far from the week inside the box', () => {
    const row = layoutRow([10, 11], 100, box);
    expect(row.baselineY).toBe(box.padding);
    expect(row.dots.every(inside)).toBe(true);
  });
});
