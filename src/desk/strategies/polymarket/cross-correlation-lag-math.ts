/**
 * Pure statistical math helpers for Cross-Correlation Lag V2 Strategy.
 */

export function calcPearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  let sumX = 0, sumY = 0;
  for (let i = 0; i < n; i++) { sumX += x[i]; sumY += y[i]; }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let covXY = 0, varX = 0, varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    covXY += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  if (varX === 0 || varY === 0) return 0;
  return covXY / Math.sqrt(varX * varY);
}

export function calcCrossCorrelation(seriesA: number[], seriesB: number[], lag: number): number {
  if (lag < 0) return 0;
  const n = Math.min(seriesA.length, seriesB.length) - lag;
  if (n < 2) return 0;
  return calcPearsonCorrelation(seriesA.slice(0, n), seriesB.slice(lag, lag + n));
}

export function findBestLag(
  seriesA: number[], seriesB: number[], maxLag: number,
): { lag: number; correlation: number } {
  let bestLag = 0, bestCorr = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    const corr = calcCrossCorrelation(seriesA, seriesB, lag);
    if (Math.abs(corr) > Math.abs(bestCorr)) { bestCorr = corr; bestLag = lag; }
  }
  return { lag: bestLag, correlation: bestCorr };
}

export function predictMove(leaderPrices: number[], lag: number): number {
  if (lag <= 0 || leaderPrices.length < lag + 1) return 0;
  return leaderPrices[leaderPrices.length - 1] - leaderPrices[leaderPrices.length - 1 - lag];
}
