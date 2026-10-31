// Agreement between friends for the listener check. Plain code, no libraries.

// Intraclass correlation, two-way random effects, absolute agreement (Shrout & Fleiss 1979, ICC(2,1) and ICC(2,k)).
// rows = clips, columns = friends; every clip rated by every friend. `single` is how far one friend's score can be
// trusted, `average` is how far the panel's mean can be.
export function icc(scores: number[][]): { single: number; average: number } {
  const n = scores.length;
  const k = scores[0]?.length ?? 0;
  if (n < 2 || k < 2 || scores.some((row) => row.length !== k)) throw new Error('icc needs at least 2 clips, each rated by the same 2+ friends');
  const grand = scores.flat().reduce((a, b) => a + b, 0) / (n * k);
  const rowMeans = scores.map((row) => row.reduce((a, b) => a + b, 0) / k);
  const colMeans = Array.from({ length: k }, (_, j) => scores.reduce((a, row) => a + row[j], 0) / n);
  const msr = (k * rowMeans.reduce((a, m) => a + (m - grand) ** 2, 0)) / (n - 1);
  const msc = (n * colMeans.reduce((a, m) => a + (m - grand) ** 2, 0)) / (k - 1);
  let sse = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) sse += (scores[i][j] - rowMeans[i] - colMeans[j] + grand) ** 2;
  const mse = sse / ((n - 1) * (k - 1));
  return {
    single: (msr - mse) / (msr + (k - 1) * mse + (k * (msc - mse)) / n),
    average: (msr - mse) / (msr + (msc - mse) / n),
  };
}

// Small seeded random numbers (mulberry32), so a report gives the same range every time it is run.
function random(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 95% range by resampling clips: redo the sum on 2000 random sets of the same clips (some twice, some left out) and
// keep the middle 95%. Resamples where every clip is the same are skipped, as the sum has no answer there.
export function bootstrap(rows: number[][], stat: (rows: number[][]) => number, reps = 2000, seed = 1): [number, number] {
  const next = random(seed);
  const values: number[] = [];
  for (let r = 0; r < reps; r++) {
    const sample = rows.map(() => rows[Math.floor(next() * rows.length)]);
    const value = stat(sample);
    if (Number.isFinite(value)) values.push(value);
  }
  values.sort((a, b) => a - b);
  return [values[Math.floor(values.length * 0.025)], values[Math.ceil(values.length * 0.975) - 1]];
}

// Koo & Li 2016, read on the lower end of the range.
export function iccWords(value: number): string {
  if (value < 0.5) return 'poor';
  if (value < 0.75) return 'moderate';
  if (value < 0.9) return 'good';
  return 'excellent';
}

// Cohen's kappa: how often two lists of labels agree, after taking out the agreement chance alone would give.
// 1 = always agree, 0 = no better than chance. NaN when chance alone would already explain it all (one label everywhere).
export function cohenKappa(a: string[], b: string[]): number {
  if (a.length !== b.length || a.length === 0) throw new Error('cohenKappa needs two lists of the same length');
  const share = (list: string[], label: string) => list.filter((l) => l === label).length / list.length;
  const observed = a.filter((label, i) => label === b[i]).length / a.length;
  const chance = [...new Set([...a, ...b])].reduce((sum, label) => sum + share(a, label) * share(b, label), 0);
  return chance === 1 ? NaN : (observed - chance) / (1 - chance);
}
