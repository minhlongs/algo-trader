// SPDX-License-Identifier: MIT
/**
 * Stitch Screen #17 — Avellaneda-Lipkin Market Making, Kyle-Back Insider Dynamics & VPIN Toxicity.
 * Powers `site/public/avellaneda-lipkin-kyle-back-cockpit.html` and `GET /api/v1/stitch-cockpit/avellaneda-lipkin`.
 */

export interface AvellanedaLipkinQuoteLevel {
  readonly level: 'L1' | 'L2' | 'L3';
  readonly bidPrice: number;
  readonly askPrice: number;
  readonly bidSizeLots: number;
  readonly askSizeLots: number;
}

export interface KyleBackInsiderMetric {
  readonly kyleLambda: number;
  readonly insiderInformationSharePct: number;
  readonly expectedInsiderProfitUsd: number;
  readonly marketDepthUsd: number;
}

export interface VpinToxicityBucket {
  readonly bucket: string;
  readonly buyVolume: number;
  readonly sellVolume: number;
  readonly imbalance: number;
  readonly toxicityPct: number;
}

export interface AvellanedaLipkinCockpitSnapshot {
  readonly screenId: 'code-authored-screen-17';
  readonly file: 'site/public/avellaneda-lipkin-kyle-back-cockpit.html';
  readonly midPrice: number;
  readonly reservationPrice: number;
  readonly inventoryUnits: number;
  readonly riskAversionGamma: number;
  readonly volatilitySigma: number;
  readonly optimalHalfSpreadBps: number;
  readonly inventorySkewBps: number;
  readonly bidPrice: number;
  readonly askPrice: number;
  readonly fillProbabilityPct: number;
  readonly quoteLadder: readonly AvellanedaLipkinQuoteLevel[];
  readonly kyleBack: KyleBackInsiderMetric;
  readonly vpin: {
    readonly vpinToxicityPct: number;
    readonly state: 'CALM' | 'MODERATE' | 'TOXIC';
    readonly buckets: readonly VpinToxicityBucket[];
  };
}

const round = (value: number, digits = 4): number => Number(value.toFixed(digits));

export function buildAvellanedaLipkinCockpitSnapshot(
  inventoryUnits = 4.5,
  riskAversionGamma = 0.5,
  volatilitySigma = 0.05,
  midPrice = 100,
): AvellanedaLipkinCockpitSnapshot {
  const horizonSeconds = 1;
  const orderArrivalK = 20;
  const variance = volatilitySigma * volatilitySigma;
  const inventoryPenalty = inventoryUnits * riskAversionGamma * variance * horizonSeconds;
  const reservationPrice = midPrice - inventoryPenalty;
  const optimalSpread = riskAversionGamma * variance * horizonSeconds
    + (2 / riskAversionGamma) * Math.log(1 + riskAversionGamma / orderArrivalK);
  const halfSpread = optimalSpread / 2;
  const bidPrice = reservationPrice - halfSpread;
  const askPrice = reservationPrice + halfSpread;
  const optimalHalfSpreadBps = (halfSpread / midPrice) * 10000;
  const inventorySkewBps = ((reservationPrice - midPrice) / midPrice) * 10000;

  const quoteLadder: readonly AvellanedaLipkinQuoteLevel[] = [
    { level: 'L1', bidPrice: round(bidPrice), askPrice: round(askPrice), bidSizeLots: 18.4, askSizeLots: 9.6 },
    { level: 'L2', bidPrice: round(bidPrice - halfSpread), askPrice: round(askPrice + halfSpread), bidSizeLots: 22.1, askSizeLots: 14.3 },
    { level: 'L3', bidPrice: round(bidPrice - halfSpread * 2), askPrice: round(askPrice + halfSpread * 2), bidSizeLots: 31.7, askSizeLots: 20.8 },
  ];

  const rawBuckets = [
    { bucket: 'B1', buyVolume: 1200, sellVolume: 900 },
    { bucket: 'B2', buyVolume: 800, sellVolume: 1100 },
    { bucket: 'B3', buyVolume: 1500, sellVolume: 700 },
    { bucket: 'B4', buyVolume: 600, sellVolume: 1300 },
    { bucket: 'B5', buyVolume: 1000, sellVolume: 950 },
  ];
  const buckets: readonly VpinToxicityBucket[] = rawBuckets.map((b) => {
    const total = b.buyVolume + b.sellVolume;
    const imbalance = total > 0 ? Math.abs(b.buyVolume - b.sellVolume) / total : 0;
    return { ...b, imbalance: round(imbalance, 3), toxicityPct: round(imbalance * 100, 2) };
  });
  const vpinToxicityPct = round(
    buckets.reduce((sum, b) => sum + b.toxicityPct, 0) / buckets.length,
    2,
  );

  return {
    screenId: 'code-authored-screen-17',
    file: 'site/public/avellaneda-lipkin-kyle-back-cockpit.html',
    midPrice,
    reservationPrice: round(reservationPrice),
    inventoryUnits,
    riskAversionGamma,
    volatilitySigma,
    optimalHalfSpreadBps: round(optimalHalfSpreadBps, 2),
    inventorySkewBps: round(inventorySkewBps, 4),
    bidPrice: round(bidPrice),
    askPrice: round(askPrice),
    fillProbabilityPct: 68.4,
    quoteLadder,
    kyleBack: {
      kyleLambda: 0.3333,
      insiderInformationSharePct: 25,
      expectedInsiderProfitUsd: 184500,
      marketDepthUsd: 2400000,
    },
    vpin: {
      vpinToxicityPct,
      state: vpinToxicityPct >= 30 ? 'TOXIC' : vpinToxicityPct >= 15 ? 'MODERATE' : 'CALM',
      buckets,
    },
  };
}
