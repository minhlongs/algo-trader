import { EasleyLopezDePrado2012Input, EasleyLopezDePrado2012Output } from './types';

function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-0.5 * z * z);
  const p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + 1.330274429 * t))));
  return z >= 0 ? 1 - p : p;
}

/**
 * Wave 332: Easley, López de Prado & O'Hara (2012) VPIN Flow Toxicity & Flash-Crash CDF Alert.
 * Computes Volume-Synchronized Probability of Informed Trading over n volume buckets.
 */
export class EasleyLopezDePrado2012VpinToxicity {
  public evaluate(input: EasleyLopezDePrado2012Input): EasleyLopezDePrado2012Output {
    const V = Math.max(1e-6, input.bucketVolumeSize);
    const n = Math.max(1, input.buckets.length);

    const totalImbalance = input.buckets.reduce(
      (sum, b) => sum + Math.abs(b.buyVolume - b.sellVolume),
      0,
    );
    const averageAbsOrderImbalance = Number((totalImbalance / n).toFixed(4));
    const vpinMetric = Number(
      Math.min(1, Math.max(0, totalImbalance / (n * V))).toFixed(6),
    );

    const std = Math.max(1e-6, input.historicalVpinStd);
    const z = (vpinMetric - input.historicalVpinMean) / std;
    const vpinCdfScore = Number(normalCdf(z).toFixed(6));

    const liquidityWithdrawalAction =
      vpinCdfScore >= 0.95
        ? 'HALT_LIQUIDITY_PROVISION'
        : vpinCdfScore >= 0.8
          ? 'WIDEN_SPREADS_2X'
          : 'NORMAL_QUOTING';

    return {
      vpinMetric,
      vpinCdfScore,
      averageAbsOrderImbalance,
      liquidityWithdrawalAction,
    };
  }
}
