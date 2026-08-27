/**
 * Trading Loop — latency tracking helpers
 * Extracted from TradingLoop.recordLatency / medianAtPercentile.
 * Pure functions over an explicit samples array (no class coupling).
 */

/**
 * Record latency sample for p95 calculation.
 * Mutates `samples` in place (bounded window of 1000) and returns avg + p95.
 */
export function recordLatencySample(
  samples: number[],
  latency: number,
): { avg: number; p95: number } {
  samples.push(latency);
  if (samples.length > 1000) {
    samples.shift();
  }

  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const p95 = medianAtPercentile(samples, 0.95);

  return { avg, p95 };
}

/** O(1) amortized running median for percentile tracking (no full sort) */
export function medianAtPercentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const idx = Math.floor(samples.length * p);
  return samples[Math.min(idx, samples.length - 1)];
}
