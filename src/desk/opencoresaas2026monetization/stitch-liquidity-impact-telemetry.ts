// SPDX-License-Identifier: MIT
/**
 * Stitch Screen #20 — Amihud Illiquidity, Almgren-Chriss Execution & Bouchaud Propagator.
 * Powers `site/public/liquidity-impact-cockpit.html` and `GET /api/v1/stitch-cockpit/liquidity-impact`.
 */

import { AlmgrenChrissEngine } from '../almgrenchriss/almgren-chriss-engine';
import { BouchaudPropagatorEngine } from '../bouchaudpropagator';
import { AmihudEngine } from '../rollamihud/amihud-engine';
import type { MarketTradePoint } from '../rollamihud/roll-amihud-types';

export interface LiquidityImpactSnapshot {
  readonly screenId: 'code-authored-screen-20';
  readonly file: 'site/public/liquidity-impact-cockpit.html';
  readonly liquidity: {
    readonly rollSpreadPct: number;
    readonly amihudScaledRatio: number;
    readonly liquidityRegime: string;
    readonly kyleLambdaProxy: number;
    readonly kyleRSquared: number;
    readonly compositeLiquidityScore: number;
  };
  readonly execution: {
    readonly totalShares: number;
    readonly expectedCostUsd: number;
    readonly expectedCostBps: number;
    readonly variance: number;
    readonly halfLifeDays: number;
    readonly trajectory: readonly {
      readonly time: number;
      readonly holdingsRemaining: number;
      readonly tradeRate: number;
    }[];
  };
  readonly propagator: {
    readonly kernelAt0: number;
    readonly kernelAt60s: number;
    readonly kernelAt3600s: number;
    readonly permanentResidualFraction: number;
    readonly trajectory: readonly {
      readonly timeSec: number;
      readonly cumulativeImpactPrice: number;
      readonly decayFactor: number;
      readonly orderFlowImbalance: number;
    }[];
  };
}

let signedFlow = 0;
let impactFlow = 0;
const IMPACT_TRADES: readonly MarketTradePoint[] = Array.from({ length: 20 }, (_, i) => {
  const volume = 70 + 30 * Math.sin(i / 5);
  impactFlow += volume;
  return {
    timestamp: i,
    price: 100 + 0.004 * impactFlow + 0.005 * Math.sin(i / 7),
    volume,
    tradeDirection: 1,
  };
});
const DIRECTION_PATTERN = [1, 1, -1, 1, -1, -1] as const;
const TRADES: readonly MarketTradePoint[] = Array.from({ length: 40 }, (_, i) => {
  const direction = DIRECTION_PATTERN[i % DIRECTION_PATTERN.length]!;
  const volume = 50 + 20 * ((i * 7) % 5);
  signedFlow += direction * volume;
  return {
    timestamp: i,
    price: 100 + 0.002 * signedFlow + 0.05 * direction + 0.1 * Math.sin(i / 5),
    volume,
    tradeDirection: direction,
  };
});

export function buildLiquidityImpactSnapshot(totalShares = 100000, riskAversion = 0.001): LiquidityImpactSnapshot {
  const amihud = new AmihudEngine();
  const liquidity = amihud.assessMarketLiquidity([...TRADES]);
  const impactEstimate = amihud.estimatePriceImpact([...IMPACT_TRADES]);
  const ac = AlmgrenChrissEngine.calculateTrajectory({
    totalShares,
    totalTime: 1,
    numIntervals: 10,
    volatility: 0.02,
    gamma: 2e-7,
    eta: 1.5e-6,
    riskAversion,
  });
  const midPrice = TRADES[TRADES.length - 1]!.price;
  const notional = midPrice * totalShares;
  const propagator = new BouchaudPropagatorEngine({
    bareImpactGamma0: 0.12,
    decayExponentGamma: 0.25,
    characteristicTimeScaleTau0Sec: 60,
  });
  const events = [
    { timestampSec: 0, orderSign: 1 as const, orderVolumeShares: 1200 },
    { timestampSec: 12, orderSign: 1 as const, orderVolumeShares: 800 },
    { timestampSec: 35, orderSign: -1 as const, orderVolumeShares: 600 },
    { timestampSec: 80, orderSign: 1 as const, orderVolumeShares: 1500 },
    { timestampSec: 180, orderSign: -1 as const, orderVolumeShares: 900 },
  ];
  const impact = propagator.simulateImpactTrajectory(events, [0, 60, 300, 3600]);

  return {
    screenId: 'code-authored-screen-20',
    file: 'site/public/liquidity-impact-cockpit.html',
    liquidity: {
      rollSpreadPct: liquidity.rollSpread.effectiveSpreadPct,
      amihudScaledRatio: liquidity.amihud.scaledAmihudRatio,
      liquidityRegime: liquidity.amihud.liquidityRegime,
      kyleLambdaProxy: impactEstimate.kyleLambdaProxy,
      kyleRSquared: impactEstimate.rSquared,
      compositeLiquidityScore: liquidity.compositeLiquidityScore,
    },
    execution: {
      totalShares,
      expectedCostUsd: Number(ac.expectedCost.toFixed(2)),
      expectedCostBps: Number(((ac.expectedCost / Math.max(1, notional)) * 10000).toFixed(4)),
      variance: Number(ac.variance.toFixed(6)),
      halfLifeDays: Number(ac.halfLife.toFixed(4)),
      trajectory: ac.trajectory
        .filter((_, i) => i % 2 === 0 || i === ac.trajectory.length - 1)
        .map((p) => ({
          time: Number(p.time.toFixed(3)),
          holdingsRemaining: Number(p.holdingsRemaining.toFixed(2)),
          tradeRate: Number(p.tradeRate.toFixed(2)),
        })),
    },
    propagator: {
      kernelAt0: propagator.getKernelAtLag(0),
      kernelAt60s: propagator.getKernelAtLag(60),
      kernelAt3600s: propagator.getKernelAtLag(3600),
      permanentResidualFraction: propagator.estimatePermanentResidualImpactFraction(3600),
      trajectory: impact.map((p) => ({
        timeSec: p.timeSec,
        cumulativeImpactPrice: Number(p.cumulativeImpactPrice.toFixed(6)),
        decayFactor: Number(p.instantaneousDecayFactor.toFixed(6)),
        orderFlowImbalance: Number(p.orderFlowImbalance.toFixed(2)),
      })),
    },
  };
}
