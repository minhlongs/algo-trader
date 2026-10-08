import { CarrMadanReplicationResult, CarrMadanReplicationTerms, OptionQuoteStrike } from './carrmadan-types';

export class CarrMadanEngine {
  public replicateFairVariance(terms: CarrMadanReplicationTerms): CarrMadanReplicationResult {
    const { forwardPrice: F, timeToExpiryYears: T, riskFreeRatePct, quotes } = terms;

    if (F <= 0 || T <= 0) throw new Error('Forward price and expiry must be positive');
    if (quotes.length < 3) throw new Error('At least 3 option quotes required for replication');

    const r = riskFreeRatePct / 100.0;
    const sorted = [...quotes].sort((a, b) => a.strikePrice - b.strikePrice);

    // Filter and compute strike increments: Delta K_i = 0.5 * (K_{i+1} - K_{i-1})
    let putsSum = 0;
    let callsSum = 0;
    let validStrikes = 0;

    for (let i = 0; i < sorted.length; i++) {
      const q = sorted[i]!;
      const K = q.strikePrice;
      if (K <= 0) continue;

      let deltaK = 0;
      if (i === 0) {
        deltaK = sorted[1]!.strikePrice - K;
      } else if (i === sorted.length - 1) {
        deltaK = K - sorted[i - 1]!.strikePrice;
      } else {
        deltaK = 0.5 * (sorted[i + 1]!.strikePrice - sorted[i - 1]!.strikePrice);
      }

      if (deltaK <= 0) continue;

      // Weight function: w(K) = Delta K / K^2
      const weight = deltaK / (K * K);

      if (K < F) {
        // Out-of-the-money put
        const putPrice = q.putPriceUsd ?? 0;
        if (putPrice > 0) {
          putsSum += weight * putPrice;
          validStrikes++;
        }
      } else {
        // Out-of-the-money call
        const callPrice = q.callPriceUsd ?? 0;
        if (callPrice > 0) {
          callsSum += weight * callPrice;
          validStrikes++;
        }
      }
    }

    if (validStrikes === 0) {
      throw new Error('No valid OTM option quotes found for replication');
    }

    // Carr-Madan replication formula:
    // sigma_fair^2 = (2 / T) * exp(r * T) * [ sum (Delta K / K^2) * P(K) + sum (Delta K / K^2) * C(K) ]
    const compoundFactor = (2.0 / T) * Math.exp(r * T);
    const totalIntegral = putsSum + callsSum;
    const fairVariance = compoundFactor * totalIntegral;
    const fairVol = Math.sqrt(Math.max(0, fairVariance));

    return {
      fairVarianceStrikePct2: Number((fairVariance * 10000.0).toFixed(4)),
      fairVolatilityStrikePct: Number((fairVol * 100.0).toFixed(4)),
      otmPutsWeightContribution: Number((putsSum * compoundFactor * 10000.0).toFixed(4)),
      otmCallsWeightContribution: Number((callsSum * compoundFactor * 10000.0).toFixed(4)),
      strikeCountUsed: validStrikes,
      forwardPrice: F,
    };
  }
}
