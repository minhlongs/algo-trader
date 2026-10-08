import { OutOfTheMoneyOption, ReplicatedVarianceResult } from './varswap-types';

export class VarianceSwapReplicator {
  public replicateFairVariance(
    spotPriceUsd: number,
    riskFreeRatePct: number,
    timeToMaturityYears: number,
    otmOptions: OutOfTheMoneyOption[]
  ): ReplicatedVarianceResult {
    if (otmOptions.length < 2) {
      throw new Error('At least 2 OTM options required for variance replication');
    }

    const T = Math.max(0.001, timeToMaturityYears);
    const r = riskFreeRatePct / 100.0;
    const erT = Math.exp(r * T);

    const sorted = [...otmOptions].sort((a, b) => a.strike - b.strike);
    let integralSum = 0;

    for (let i = 0; i < sorted.length; i++) {
      const curr = sorted[i]!;
      let deltaK: number;

      if (i === 0) {
        deltaK = sorted[1]!.strike - curr.strike;
      } else if (i === sorted.length - 1) {
        deltaK = curr.strike - sorted[i - 1]!.strike;
      } else {
        deltaK = (sorted[i + 1]!.strike - sorted[i - 1]!.strike) / 2.0;
      }

      // 2 / (K^2) * OptionPrice * DeltaK weight
      const weight = (2.0 / (curr.strike * curr.strike)) * deltaK;
      integralSum += weight * curr.priceUsd;
    }

    const fairVariance = (2.0 / T) * erT * integralSum;
    const fairVolPct = Math.sqrt(Math.max(0, fairVariance)) * 100.0;

    return {
      fairVarianceStrike: Number(fairVariance.toFixed(6)),
      fairVolStrikePct: Number(fairVolPct.toFixed(2)),
      logContractDiscreteIntegral: Number(integralSum.toFixed(6)),
      optionsCount: sorted.length,
    };
  }
}
