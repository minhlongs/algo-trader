// SPDX-License-Identifier: MIT
/**
 * Stitch Screen #18 — Cointegration Stat-Arb, Ornstein-Uhlenbeck Half-Life & Glosten-Milgrom.
 * Powers `site/public/statarb-glosten-milgrom-cockpit.html` and `GET /api/v1/stitch-cockpit/statarb-glosten-milgrom`.
 */

import { EngleGrangerAnalyzer } from '../cointegration/engle-granger-analyzer';
import { OrnsteinUhlenbeckEstimator } from '../cointegration/ornstein-uhlenbeck-estimator';
import { GlostenMilgrom1985Engine } from '../glostenmilgrom1985';

export interface StatArbPairMetric {
  readonly pair: string;
  readonly hedgeRatio: number;
  readonly adfStatistic: number;
  readonly rSquared: number;
  readonly cointegrated: boolean;
  readonly halfLifeDays: number;
  readonly zScore: number;
  readonly signal: 'LONG_SPREAD' | 'SHORT_SPREAD' | 'NEUTRAL';
}

export interface StatArbGlostenMilgromSnapshot {
  readonly screenId: 'code-authored-screen-18';
  readonly file: 'site/public/statarb-glosten-milgrom-cockpit.html';
  readonly pairs: readonly StatArbPairMetric[];
  readonly ou: {
    readonly theta: number;
    readonly mu: number;
    readonly sigma: number;
    readonly halfLifeDays: number;
    readonly currentSpread: number;
    readonly currentZScore: number;
    readonly signal: 'LONG_SPREAD' | 'SHORT_SPREAD' | 'NEUTRAL';
  };
  readonly glostenMilgrom: {
    readonly fairValue: number;
    readonly bidPrice: number;
    readonly askPrice: number;
    readonly adverseSelectionSpread: number;
    readonly posteriorBuy: number;
    readonly posteriorSell: number;
    readonly informationAsymmetryRatio: number;
  };
  readonly summary: {
    readonly cointegratedPairs: number;
    readonly bestPair: string;
    readonly bestZScore: number;
  };
}

function ethSeries(): number[] {
  let residual = 0;
  let seed = 42;
  return Array.from({ length: 64 }, (_, i) => {
    const btc = 100 + 6 * Math.sin(i / 7) + 1.2 * Math.cos(i / 19);
    seed = (seed * 1664525 + 1013904223) >>> 0;
    residual = 0.2 * residual + 0.3 * (seed / 4294967296 - 0.5);
    return 1.5 * btc + 2 + residual;
  });
}

function series(kind: 'btc' | 'eth' | 'sol' | 'avax' | 'bnb' | 'uni'): number[] {
  return Array.from({ length: 64 }, (_, i) => {
    const wave = Math.sin(i / 7);
    const slow = Math.cos(i / 19);
    switch (kind) {
      case 'btc': return 100 + 6 * wave + 1.2 * slow;
      case 'eth': return ethSeries()[i]!;
      case 'sol': return 24 + 3.2 * Math.sin(i / 5 + 0.4) + 0.5 * slow;
      case 'avax': return 31 + 4.1 * Math.cos(i / 8) + 0.7 * Math.sin(i / 3);
      case 'bnb': return 42 + 2.4 * Math.sin(i / 11) + 0.4 * slow;
      case 'uni': return 9 + 1.1 * Math.cos(i / 6) + 0.6 * Math.sin(i / 2.7) + 0.03 * i;
    }
  });
}

function buildPair(analyzer: EngleGrangerAnalyzer, ou: OrnsteinUhlenbeckEstimator, label: string, y: number[], x: number[]): StatArbPairMetric {
  const coint = analyzer.analyzePair({ assetY: label, assetX: '', pricesY: y, pricesX: x });
  const params = ou.estimateParameters(coint.residuals);
  return {
    pair: label,
    hedgeRatio: coint.hedgeRatioBeta,
    adfStatistic: coint.adfTestStatistic,
    rSquared: coint.rSquared,
    cointegrated: coint.isCointegrated,
    halfLifeDays: params.halfLifeDays,
    zScore: params.currentZScore,
    signal: params.tradeSignal,
  };
}

export function buildStatArbGlostenMilgromSnapshot(
  informedTraderShareAlpha = 0.3,
  priorProbHighMu = 0.6,
): StatArbGlostenMilgromSnapshot {
  const analyzer = new EngleGrangerAnalyzer();
  const ouEstimator = new OrnsteinUhlenbeckEstimator();
  const pairs = [
    buildPair(analyzer, ouEstimator, 'ETH/BTC', series('eth'), series('btc')),
    buildPair(analyzer, ouEstimator, 'SOL/AVAX', series('sol'), series('avax')),
    buildPair(analyzer, ouEstimator, 'BNB/UNI', series('bnb'), series('uni')),
  ];
  const primary = analyzer.analyzePair({ assetY: 'ETH', assetX: 'BTC', pricesY: series('eth'), pricesX: series('btc') });
  const ou = ouEstimator.estimateParameters(primary.residuals);
  const gm = new GlostenMilgrom1985Engine().evaluateSequentialQuote({
    lowValueVL: 95,
    highValueVH: 105,
    priorProbHighMu,
    informedTraderShareAlpha,
  });
  const cointegratedPairs = pairs.filter((p) => p.cointegrated);
  const candidates = cointegratedPairs.length > 0 ? cointegratedPairs : pairs;
  const best = candidates.reduce((a, b) => (Math.abs(b.zScore) > Math.abs(a.zScore) ? b : a));

  return {
    screenId: 'code-authored-screen-18',
    file: 'site/public/statarb-glosten-milgrom-cockpit.html',
    pairs,
    ou: {
      theta: ou.thetaMeanReversionSpeed,
      mu: ou.muLongTermMean,
      sigma: ou.sigmaVolatility,
      halfLifeDays: ou.halfLifeDays,
      currentSpread: ou.currentSpread,
      currentZScore: ou.currentZScore,
      signal: ou.tradeSignal,
    },
    glostenMilgrom: {
      fairValue: gm.unconditionalFairValue,
      bidPrice: gm.bidPriceGivenSell,
      askPrice: gm.askPriceGivenBuy,
      adverseSelectionSpread: gm.adverseSelectionSpread,
      posteriorBuy: gm.posteriorMuAfterBuy,
      posteriorSell: gm.posteriorMuAfterSell,
      informationAsymmetryRatio: gm.informationAsymmetryRatio,
    },
    summary: {
      cointegratedPairs: cointegratedPairs.length,
      bestPair: best.pair,
      bestZScore: best.zScore,
    },
  };
}
