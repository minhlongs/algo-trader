/**
 * Backtest Price Regimes & Gamma JSON Array Parsing
 *
 * Deterministic multi-regime price & volume evolution for historical backtesting
 * so every strategy archetype (lead-lag, compression-breakout, gap-fill, tail-risk,
 * momentum-acceleration, cluster-breakout, and herd-fade) is exercised reproducibly.
 */

import type { GammaMarket } from '../polymarket/gamma-client';
import type { HistoricalMarketData } from './types';

export function parseJsonStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map((item) => String(item));
  if (typeof val === 'string' && val.trim().startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item));
    } catch {
      return [];
    }
  }
  return [];
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function simulateMarketRegimeTick(
  market: GammaMarket,
  tickIdx: number,
  totalTicks: number,
  marketIdx: number,
): HistoricalMarketData {
  const progress = tickIdx / Math.max(1, totalTicks - 1);
  const slot = marketIdx % 10;
  let price = 0.50;

  // Synchronized macro herd window (ticks 80..112): all markets co-move tightly
  // for 24 ticks (building EMA > 0.65), then decorrelate slightly so herd peak fires.
  if (tickIdx >= 80 && tickIdx <= 112) {
    const t = tickIdx - 80;
    if (t <= 24) {
      price = 0.42 + t * 0.008;
    } else {
      const dir = marketIdx % 2 === 0 ? 1 : -1;
      price = 0.612 + dir * (t - 24) * 0.015;
    }
  } else if (slot === 0 || slot === 1) {
    // Synchronized Lead-Lag / Cross-Event Drift Pair:
    // Ticks 0..13 co-move (high 15-tick correlation > 0.85, flat 5-tick return on tick 14 for slot 1).
    const cycle = tickIdx % 20;
    if (cycle < 10) {
      price = 0.46 + cycle * 0.008;
    } else if (cycle < 14) {
      price = 0.532;
    } else if (cycle === 14) {
      price = slot === 0 ? 0.595 : 0.532;
    } else if (cycle <= 17) {
      price = 0.595;
    } else {
      price = 0.46;
    }
  } else if (slot === 2 || slot === 3) {
    // Long-Window Vol Compression then Explosive Breakout:
    // 25 ticks wide oscillation -> 10 ticks tight squeeze (volShort/volLong < 0.20) -> single-tick jump > 2.5*ATR.
    const cycle = tickIdx % 40;
    const sign = slot === 2 ? 1 : -1;
    if (cycle < 25) {
      price = 0.50 + (cycle % 2 === 0 ? 0.025 : -0.025);
    } else if (cycle < 35) {
      price = 0.50 + (cycle % 2 === 0 ? 0.0005 : -0.0005);
    } else if (cycle < 38) {
      price = 0.50 + sign * (0.045 + (cycle - 35) * 0.012);
    } else {
      price = 0.50 - sign * 0.025;
    }
  } else if (slot === 4 || slot === 5) {
    // Gap-Fill Reversion & Time-Weighted Z-Score Spike:
    // 24 ticks calm baseline -> 3 ticks persistent gap (zScore > 2.4, confirmTicks = 2) -> reversion.
    const cycle = tickIdx % 28;
    const sign = slot === 4 ? 1 : -1;
    if (cycle < 24) {
      price = 0.50 + (cycle % 2 === 0 ? 0.006 : -0.006);
    } else if (cycle === 24) {
      price = 0.50 + sign * 0.068;
    } else if (cycle === 25) {
      price = 0.50 + sign * 0.070;
    } else if (cycle === 26) {
      price = 0.50 + sign * 0.072;
    } else {
      price = 0.50 - sign * 0.020;
    }
  } else if (slot === 6) {
    // Tail-Risk Excursion (>0.90 and <0.88 oscillations so tail reversion rate >= 0.5).
    const cycle = tickIdx % 6;
    if (cycle === 0 || cycle === 1) price = 0.87;
    else if (cycle === 2) price = 0.915;
    else if (cycle === 3) price = 0.945;
    else price = 0.855;
  } else {
    // Accelerating & Persistent Momentum Waves across slots 7, 8, 9.
    const cycle = tickIdx % 16;
    if (cycle < 8) {
      const step = cycle / 7;
      price = 0.36 + 0.28 * (step * step);
    } else {
      const step = (cycle - 8) / 7;
      price = 0.64 - 0.28 * (step * step);
    }
  }

  return {
    conditionId: market.conditionId,
    question: market.question,
    source: 'synthetic-regime',
    yesTokenId: market.yesTokenId,
    noTokenId: market.noTokenId,
    yesPrice: round4(clamp(price, 0.02, 0.98)),
    volume: Math.round(market.volume * (0.1 + 0.9 * progress)),
    liquidity: Math.round(market.liquidity * (0.3 + 0.7 * progress)),
    closed: market.closed,
    endDate: market.endDate,
  };
}
