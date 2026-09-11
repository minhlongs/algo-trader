import { resolve, dirname } from 'path';

export interface DeskStrategySeed {
  id: string;
  name: string;
  description: string;
  category: 'arbitrage' | 'momentum' | 'mean-reversion' | 'statistical' | 'portfolio' | 'risk' | 'hedging' | 'other';
  riskLevel: number;
  priceUsdMonthly: number; // in cents
  tags: string[];
  backtestSummary?: {
    sharpe: number;
    maxDrawdown: number;
    winRate: number;
    periodDays: number;
    totalTrades?: number;
    totalPnlUsd?: number;
  };
}

// Resolve desk strategies directory for validation.
// When running compiled (dist/), the path differs from ts-node (src/).
const _filename = typeof __filename !== 'undefined' ? __filename : '';
export const DESK_STRATEGIES_ROOT = resolve(
  dirname(_filename || process.cwd()),
  '..', '..', '..', 'desk', 'strategies',
);

/** Map seed IDs to desk strategy file paths for cross-validation. */
export const STRATEGY_IMPLEMENTATIONS: Record<string, string> = {
  'cross-platform-arb': 'cross-platform-arb.ts',
  'whale-copy-trader': 'polymarket/whale-copy-trader.ts',
  'delta-neutral-vol-arb': 'polymarket/delta-neutral-volatility-arbitrage.ts',
  'resolution-frontrunner': 'polymarket/resolution-frontrunner-v2.ts',
  'listing-arbitrage-sniper': 'polymarket/listing-arbitrage-sniper.ts',
  'cycle-end-sniper': 'polymarket/cycle-end-sniper.ts',
  'delta-neutral-volatility-arbitrage': 'polymarket/delta-neutral-volatility-arbitrage.ts',
  'cross-event-drift-v2': 'polymarket/cross-event-drift-v2.ts',
  'resolution-frontrunner-v2': 'polymarket/resolution-frontrunner-v2.ts',
};
