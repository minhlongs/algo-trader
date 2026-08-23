/**
 * Strategy Family Definitions — Phase 11
 *
 * Four initial hypothesis families for alpha discovery:
 *  - momentum-breakout: breakout + volume confirmation
 *  - trend-following: trend + volume confirmation
 *  - mean-reversion: extreme deviation + volatility normalization
 *  - volatility-breakout: volatility expansion + breakout
 */

import type { StrategyFamily } from './strategy-family-types';

export const momentumBreakout: StrategyFamily = {
  id: 'momentum-breakout',
  name: 'Momentum Breakout',
  description:
    'Enters when price breaks above the highest high of the last N bars ' +
    'and volume confirms the move with a z-score above a threshold.',
  category: 'momentum',
  features: ['returns', 'realizedVol', 'volumeZscore'],
  entryRule: 'price > highest high of last N bars AND volumeZscore > threshold',
  exitRule: 'price < lowest low of last M bars OR trailing stop',
  positionSizing: 'fixed-fraction',
  defaultParams: {
    breakoutLookback: 20,
    volumeThreshold: 1.0,
    exitLookback: 10,
    trailingStopBps: 200,
  },
  paramBounds: {
    breakoutLookback: { min: 5, max: 100, step: 5 },
    volumeThreshold: { min: 0.5, max: 3.0, step: 0.1 },
    exitLookback: { min: 3, max: 50, step: 1 },
    trailingStopBps: { min: 50, max: 500, step: 25 },
  },
};

export const trendFollowing: StrategyFamily = {
  id: 'trend-following',
  name: 'Trend Following',
  description:
    'Enters when the linear-regression slope of closes is positive and ' +
    'volume abnormality confirms directional conviction.',
  category: 'momentum',
  features: ['closeSlope', 'realizedVol', 'volumeAbnormality'],
  entryRule: 'closeSlope > threshold AND volumeAbnormality > threshold',
  exitRule: 'closeSlope < -threshold OR fixed stop',
  positionSizing: 'fixed-fraction',
  defaultParams: {
    slopeThreshold: 0.001,
    volumeThreshold: 1.5,
    stopLossBps: 150,
    takeProfitBps: 300,
  },
  paramBounds: {
    slopeThreshold: { min: 0.0002, max: 0.01, step: 0.0002 },
    volumeThreshold: { min: 0.8, max: 3.0, step: 0.1 },
    stopLossBps: { min: 50, max: 400, step: 25 },
    takeProfitBps: { min: 100, max: 800, step: 50 },
  },
};

export const meanReversion: StrategyFamily = {
  id: 'mean-reversion',
  name: 'Mean Reversion',
  description:
    'Enters when z-score drops below an extreme negative threshold while ' +
    'volatility remains compressed, exiting on normalization.',
  category: 'mean-reversion',
  features: ['returns', 'realizedVol', 'volumeZscore'],
  entryRule: 'z-score < -threshold AND realizedVol < volMultiplier × average',
  exitRule: 'z-score > reentryThreshold OR timeout',
  positionSizing: 'equal-risk',
  defaultParams: {
    zThreshold: 2.0,
    volMultiplier: 2.0,
    reentryThreshold: 0.5,
    maxHoldBars: 48,
  },
  paramBounds: {
    zThreshold: { min: 1.0, max: 4.0, step: 0.25 },
    volMultiplier: { min: 1.0, max: 4.0, step: 0.25 },
    reentryThreshold: { min: 0.0, max: 2.0, step: 0.25 },
    maxHoldBars: { min: 6, max: 96, step: 6 },
  },
};

export const volatilityBreakout: StrategyFamily = {
  id: 'volatility-breakout',
  name: 'Volatility Breakout',
  description:
    'Enters when ATR expands beyond a multiple of its average while price ' +
    'breaks out of a recent range.',
  category: 'volatility',
  features: ['realizedVol', 'ATR', 'returns'],
  entryRule: 'ATR > expansion × average AND price breaks recent range',
  exitRule: 'ATR < 0.5 × average OR trailing stop',
  positionSizing: 'fixed-fraction',
  defaultParams: {
    atrLookback: 14,
    atrExpansion: 2.0,
    rangeLookback: 20,
    trailingStopBps: 250,
  },
  paramBounds: {
    atrLookback: { min: 5, max: 50, step: 1 },
    atrExpansion: { min: 1.2, max: 4.0, step: 0.2 },
    rangeLookback: { min: 5, max: 60, step: 5 },
    trailingStopBps: { min: 50, max: 600, step: 25 },
  },
};

/** All four families in a flat array. */
export const ALL_FAMILIES: StrategyFamily[] = [
  momentumBreakout,
  trendFollowing,
  meanReversion,
  volatilityBreakout,
];