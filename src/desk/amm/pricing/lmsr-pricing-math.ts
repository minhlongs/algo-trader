/**
 * Pure Log-Sum-Exp vector math helpers for LMSR Pricing Engine
 */

export function validateLmsrInputs(liabilities: number[], b: number, bErrorPrefix = 'LMSR liquidity parameter b'): void {
  if (b <= 0) {
    throw new Error(`${bErrorPrefix} must be positive, got ${b}`);
  }
  if (!liabilities || liabilities.length === 0) {
    throw new Error('Liabilities vector cannot be empty');
  }
}

export function computeShiftedExponentials(
  liabilities: number[],
  b: number
): { maxScaled: number; expShifted: Float64Array; sumExp: number } {
  const n = liabilities.length;
  let maxScaled = liabilities[0] / b;
  for (let i = 1; i < n; i++) {
    const scaled = liabilities[i] / b;
    if (scaled > maxScaled) {
      maxScaled = scaled;
    }
  }

  const expShifted = new Float64Array(n);
  let sumExp = 0;
  for (let i = 0; i < n; i++) {
    const val = Math.exp(liabilities[i] / b - maxScaled);
    expShifted[i] = val;
    sumExp += val;
  }

  return { maxScaled, expShifted, sumExp };
}
