import { SmilePoint, ArbitrageViolation, SmileRepairResult } from './volarb-types';

export class ButterflySmileRepairer {
  public repairSmile(points: SmilePoint[]): SmileRepairResult {
    const sorted = [...points].sort((a, b) => a.strike - b.strike);
    const violationsFound: ArbitrageViolation[] = [];

    // Breeden-Litzenberger: Second derivative of call price with respect to strike must be non-negative
    for (let i = 1; i < sorted.length - 1; i++) {
      const pLeft = sorted[i - 1]!;
      const pMid = sorted[i]!;
      const pRight = sorted[i + 1]!;

      const dK1 = pMid.strike - pLeft.strike;
      const dK2 = pRight.strike - pMid.strike;

      const slope1 = (pMid.callPrice - pLeft.callPrice) / dK1;
      const slope2 = (pRight.callPrice - pMid.callPrice) / dK2;
      const secondDiff = slope2 - slope1;

      if (secondDiff < -1e-6) {
        violationsFound.push({
          type: 'BUTTERFLY_SPREAD_NEGATIVE_DENSITY',
          locationDescription: `Strike ${pMid.strike} (density curvature=${secondDiff.toFixed(6)})`,
          severityMetric: Number(Math.abs(secondDiff).toFixed(6)),
        });
      }
    }

    // Convexify call prices to ensure d^2 C / dK^2 >= 0
    const repairedCallPrices = sorted.map(p => p.callPrice);
    let modified = true;
    let iteration = 0;

    while (modified && iteration < 50) {
      modified = false;
      iteration++;

      for (let i = 1; i < sorted.length - 1; i++) {
        const kLeft = sorted[i - 1]!.strike;
        const kMid = sorted[i]!.strike;
        const kRight = sorted[i + 1]!.strike;

        const cLeft = repairedCallPrices[i - 1]!;
        const cRight = repairedCallPrices[i + 1]!;

        // Linear interpolation bound for convexity
        const convexCeiling = cLeft + ((kMid - kLeft) / (kRight - kLeft)) * (cRight - cLeft);

        if (repairedCallPrices[i]! > convexCeiling + 1e-6) {
          repairedCallPrices[i] = convexCeiling;
          modified = true;
        }
      }
    }

    const repairedPoints: SmilePoint[] = sorted.map((p, idx) => ({
      strike: p.strike,
      callPrice: Number(repairedCallPrices[idx]!.toFixed(4)),
      totalVarianceW: p.totalVarianceW,
    }));

    return {
      originalPoints: sorted,
      repairedPoints,
      violationsFound,
      isArbitrageFree: violationsFound.length === 0,
    };
  }
}
