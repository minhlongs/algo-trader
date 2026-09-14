export function calcReturns(prices: number[]): number[] {
  if (prices.length < 2) return [];
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(prices[i] - prices[i - 1]);
  }
  return returns;
}

export function calcVariance(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / values.length;
  let sumSq = 0;
  for (const v of values) sumSq += (v - mean) ** 2;
  return sumSq / values.length;
}

export function calcVarianceRatio(shortVar: number, longVar: number): number {
  if (longVar === 0) return 0;
  return shortVar / longVar;
}

export function classifyRegime(
  vr: number,
  trendThresh: number,
  meanRevertThresh: number,
): 'trending' | 'mean-reverting' | 'neutral' {
  if (vr >= trendThresh) return 'trending';
  if (vr <= meanRevertThresh) return 'mean-reverting';
  return 'neutral';
}

export function detectSwitch(
  prevRegime: string,
  currentRegime: string,
): 'to-trending' | 'to-mean-reverting' | null {
  if (prevRegime === currentRegime) return null;
  if (currentRegime === 'trending' && prevRegime !== 'trending') return 'to-trending';
  if (currentRegime === 'mean-reverting' && prevRegime !== 'mean-reverting') return 'to-mean-reverting';
  return null;
}

export function updateEma(prevEma: number | null, newValue: number, alpha: number): number {
  if (prevEma === null) return newValue;
  if (alpha <= 0) return prevEma;
  if (alpha >= 1) return newValue;
  return alpha * newValue + (1 - alpha) * prevEma;
}
