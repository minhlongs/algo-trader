// SPDX-License-Identifier: MIT
/**
 * Stitch Screen #15 — Hawkes Order-Flow Criticality, Avellaneda-Stoikov & Kyle Lambda Telemetry
 * Powers `site/public/hawkes-orderflow-radar.html` and `GET /api/v1/stitch-cockpit/hawkes-radar`.
 */

export interface HawkesVenueIntensityNode {
  readonly venue: string;
  readonly baselineRateHz: number;
  readonly branchingRatio: number;
  readonly currentIntensityHz: number;
  readonly kyleLambdaBpsPerM: number;
  readonly glostenMilgromBelief: number;
  readonly criticalityStatus: 'SUB_CRITICAL' | 'NEAR_CRITICAL' | 'SUPER_CRITICAL_HALT';
}

export interface HawkesOrderFlowRadarSnapshot {
  readonly screenId: 'projects/1566829715937419119/screens/f1a4c839e2054b719d824a63109e4c52';
  readonly file: 'site/public/hawkes-orderflow-radar.html';
  readonly midPriceUsd: number;
  readonly inventoryUnits: number;
  readonly riskAversionGamma: number;
  readonly reservationPriceUsd: number;
  readonly optimalSpreadBps: number;
  readonly optimalBidUsd: number;
  readonly optimalAskUsd: number;
  readonly aggregateBranchingRatio: number;
  readonly venues: readonly HawkesVenueIntensityNode[];
}

export function buildHawkesOrderFlowRadarSnapshot(
  inventoryUnits = 4.5,
  riskAversionGamma = 0.15,
  midPriceUsd = 94250,
): HawkesOrderFlowRadarSnapshot {
  const sigmaSqHorizon = 0.00018 * 60; // 1-minute variance proxy in normalized units
  const inventorySkewUsd = Number((inventoryUnits * riskAversionGamma * sigmaSqHorizon * midPriceUsd).toFixed(2));
  const reservationPriceUsd = Number((midPriceUsd - inventorySkewUsd).toFixed(2));
  const optimalSpreadUsd = Number(
    (riskAversionGamma * sigmaSqHorizon * midPriceUsd + (2 / Math.max(0.01, riskAversionGamma)) * Math.log(1 + riskAversionGamma / 1.45)).toFixed(2),
  );
  const optimalSpreadBps = Number(((optimalSpreadUsd / midPriceUsd) * 10000).toFixed(2));
  const optimalBidUsd = Number((reservationPriceUsd - optimalSpreadUsd / 2).toFixed(2));
  const optimalAskUsd = Number((reservationPriceUsd + optimalSpreadUsd / 2).toFixed(2));

  const venues: readonly HawkesVenueIntensityNode[] = [
    {
      venue: 'Binance Perp (TY3)',
      baselineRateHz: 42.5,
      branchingRatio: 0.68,
      currentIntensityHz: 132.8,
      kyleLambdaBpsPerM: 1.42,
      glostenMilgromBelief: 0.56,
      criticalityStatus: 'SUB_CRITICAL',
    },
    {
      venue: 'OKX Perp (HKG)',
      baselineRateHz: 28.0,
      branchingRatio: 0.74,
      currentIntensityHz: 107.7,
      kyleLambdaBpsPerM: 1.85,
      glostenMilgromBelief: 0.61,
      criticalityStatus: 'NEAR_CRITICAL',
    },
    {
      venue: 'Bybit Linear (SIN)',
      baselineRateHz: 24.2,
      branchingRatio: 0.64,
      currentIntensityHz: 67.2,
      kyleLambdaBpsPerM: 2.1,
      glostenMilgromBelief: 0.53,
      criticalityStatus: 'SUB_CRITICAL',
    },
    {
      venue: 'Hyperliquid L1',
      baselineRateHz: 19.8,
      branchingRatio: 0.79,
      currentIntensityHz: 94.3,
      kyleLambdaBpsPerM: 2.35,
      glostenMilgromBelief: 0.66,
      criticalityStatus: 'NEAR_CRITICAL',
    },
  ];

  const aggregateBranchingRatio = Number(
    (venues.reduce((acc, v) => acc + v.branchingRatio, 0) / venues.length).toFixed(4),
  );

  return {
    screenId: 'projects/1566829715937419119/screens/f1a4c839e2054b719d824a63109e4c52',
    file: 'site/public/hawkes-orderflow-radar.html',
    midPriceUsd,
    inventoryUnits,
    riskAversionGamma,
    reservationPriceUsd,
    optimalSpreadBps,
    optimalBidUsd,
    optimalAskUsd,
    aggregateBranchingRatio,
    venues,
  };
}
