/**
 * Wave 285 — Cont, Kukanov & Stoikov (2014): The Price Impact of Order Book Events (OFI)
 * Computes high-frequency Order Flow Imbalance (OFI) from L1 quote transitions and estimates price impact.
 */
import type {
  Cont2014OfiConfig,
  Cont2014OfiResult,
  OfiEventStep,
} from './types';

export function computeContKukanovStoikov2014Ofi(
  cfg: Cont2014OfiConfig,
): Cont2014OfiResult {
  const { snapshots, baselineMarketDepthD: depthD } = cfg;

  if (snapshots.length < 2 || depthD <= 0) {
    throw new Error('Invalid Cont2014OfiConfig: requires at least 2 L1 snapshots and positive depth');
  }

  const steps: OfiEventStep[] = [];
  let cumulativeOfi = 0;

  for (let n = 1; n < snapshots.length; n++) {
    const prev = snapshots[n - 1];
    const curr = snapshots[n];

    const bidIncr = curr.bidPrice >= prev.bidPrice ? curr.bidSize : 0;
    const bidDecr = curr.bidPrice <= prev.bidPrice ? prev.bidSize : 0;
    const askIncr = curr.askPrice <= prev.askPrice ? curr.askSize : 0;
    const askDecr = curr.askPrice >= prev.askPrice ? prev.askSize : 0;

    const en = (bidIncr - bidDecr) - (askIncr - askDecr);
    const prevMid = 0.5 * (prev.bidPrice + prev.askPrice);
    const currMid = 0.5 * (curr.bidPrice + curr.askPrice);

    cumulativeOfi += en;
    steps.push({
      index: n,
      eventContributionEn: en,
      midPriceChange: currMid - prevMid,
    });
  }

  const beta = 1 / (2 * depthD);
  return {
    steps,
    cumulativeOfi,
    impactCoefficientBeta: beta,
    predictedMidPriceDelta: beta * cumulativeOfi,
  };
}
