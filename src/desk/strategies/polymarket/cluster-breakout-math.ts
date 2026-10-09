/**
 * Pure mathematical calculations and clustering algorithms for Cluster Breakout V2.
 */

export function buildPriceBins(
  prices: number[],
  numBins: number,
): { counts: number[]; binLow: number; binWidth: number } {
  if (prices.length === 0) {
    return { counts: new Array(numBins).fill(0), binLow: 0, binWidth: 0 };
  }

  let min = prices[0];
  let max = prices[0];
  for (const p of prices) {
    if (p < min) min = p;
    if (p > max) max = p;
  }

  if (max === min) {
    const counts = new Array(numBins).fill(0);
    counts[0] = prices.length;
    return { counts, binLow: min, binWidth: 0 };
  }

  const binWidth = (max - min) / numBins;
  const counts = new Array(numBins).fill(0);

  for (const p of prices) {
    let idx = Math.floor((p - min) / binWidth);
    if (idx >= numBins) idx = numBins - 1;
    counts[idx]++;
  }

  return { counts, binLow: min, binWidth };
}

export function findDensestCluster(
  counts: number[],
): { startBin: number; endBin: number; totalCount: number } {
  if (counts.length === 0) return { startBin: 0, endBin: 0, totalCount: 0 };

  let bestStart = 0;
  let bestEnd = 0;
  let bestTotal = counts[0];

  for (let start = 0; start < counts.length; start++) {
    let total = 0;
    for (let end = start; end < counts.length; end++) {
      total += counts[end];
      if (total > bestTotal) {
        bestTotal = total;
        bestStart = start;
        bestEnd = end;
      }
    }
  }

  return { startBin: bestStart, endBin: bestEnd, totalCount: bestTotal };
}

export function calcClusterBounds(
  startBin: number,
  endBin: number,
  binLow: number,
  binWidth: number,
): { low: number; high: number } {
  return {
    low: binLow + startBin * binWidth,
    high: binLow + (endBin + 1) * binWidth,
  };
}

export function detectClusterBreakout(
  price: number,
  low: number,
  high: number,
): 'bullish' | 'bearish' | null {
  if (price > high) return 'bullish';
  if (price < low) return 'bearish';
  return null;
}
