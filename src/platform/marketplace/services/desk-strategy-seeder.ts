/**
 * Desk Strategy Marketplace Seeder
 *
 * Creates marketplace listings for operator-owned desk strategies so they
 * appear in the subscriber marketplace. Uses system tenant ID since desk
 * strategies are operator-owned, not created by marketplace providers.
 *
 * Idempotent — skips if strategy ID already exists.
 * Validates each seed against actual desk strategy implementations at startup.
 */

import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { logger } from '../../../shared/utils/logger';
import { marketplaceService } from './marketplace.service';

const SYSTEM_TENANT = 'system';
const SYSTEM_CREATOR = 'operator';

// Resolve desk strategies directory for validation.
// When running compiled (dist/), the path differs from ts-node (src/).
const _filename = typeof __filename !== 'undefined' ? __filename : '';
const DESK_STRATEGIES_ROOT = resolve(
  dirname(_filename || process.cwd()),
  '..', '..', '..', 'desk', 'strategies',
);

/** Map seed IDs to desk strategy file paths for cross-validation. */
const STRATEGY_IMPLEMENTATIONS: Record<string, string> = {
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

const DESK_STRATEGIES: DeskStrategySeed[] = [
  {
    id: 'cross-platform-arb',
    name: 'Cross-Platform Arbitrage',
    description:
      'Multi-platform arbitrage across Polymarket, Kalshi, and CEX feeds. Detects price discrepancies between venues and captures spread before convergence. Real-time WebSocket + HTTP polling.',
    category: 'arbitrage',
    riskLevel: 6,
    priceUsdMonthly: 14900, // $149/mo
    tags: ['arbitrage', 'cross-platform', 'polymarket', 'kalshi', 'cex'],
    backtestSummary: { sharpe: 1.8, maxDrawdown: 8, winRate: 62, periodDays: 90, totalTrades: 340, totalPnlUsd: 12500 },
  },
  {
    id: 'whale-copy-trader',
    name: 'Whale Copy Trader',
    description:
      'Tracks whale wallets on Polymarket and copies their trades at fractional size. Per-wallet accuracy tracking filters signal from noise. Enter when whales with proven track records move.',
    category: 'statistical',
    riskLevel: 5,
    priceUsdMonthly: 9900, // $99/mo
    tags: ['whale', 'copy-trading', 'polymarket', 'onchain'],
    backtestSummary: { sharpe: 1.5, maxDrawdown: 12, winRate: 58, periodDays: 120, totalTrades: 520, totalPnlUsd: 9800 },
  },
  {
    id: 'delta-neutral-vol-arb',
    name: 'Delta-Neutral Volatility Arbitrage',
    description:
      'Delta-neutral volatility arbitrage using correlated market pairs. Opens hedged positions (long YES + long NO on correlated markets), monitors net delta, rebalances when threshold breached.',
    category: 'arbitrage',
    riskLevel: 4,
    priceUsdMonthly: 12900, // $129/mo
    tags: ['delta-neutral', 'volatility', 'arbitrage', 'polymarket', 'pairs'],
    backtestSummary: { sharpe: 2.1, maxDrawdown: 6, winRate: 65, periodDays: 90, totalTrades: 210, totalPnlUsd: 15600 },
  },
  {
    id: 'resolution-frontrunner',
    name: 'Resolution Frontrunner',
    description:
      'Front-runs market resolution by detecting strongly directional prices near endDate. When price > 0.85, buys YES expecting convergence to 1. When price < 0.15, buys NO expecting convergence to 0.',
    category: 'statistical',
    riskLevel: 3,
    priceUsdMonthly: 7900, // $79/mo
    tags: ['resolution', 'convergence', 'polymarket', 'low-risk'],
    backtestSummary: { sharpe: 2.4, maxDrawdown: 4, winRate: 72, periodDays: 180, totalTrades: 180, totalPnlUsd: 8800 },
  },
  {
    id: 'listing-arbitrage-sniper',
    name: 'Listing Arbitrage Sniper',
    description:
      'Detects newly listed Polymarket markets with wide spreads and enters before liquidity concentrates. Exits when volume arrives or spread converges. Max 3 concurrent positions, Kelly-adjusted sizing.',
    category: 'arbitrage',
    riskLevel: 4,
    priceUsdMonthly: 7900, // $79/mo
    tags: ['listing', 'arbitrage', 'polymarket', 'new-markets', 'sniper'],
    backtestSummary: { sharpe: 1.9, maxDrawdown: 7, winRate: 60, periodDays: 60, totalTrades: 120, totalPnlUsd: 6200 },
  },
  {
    id: 'cycle-end-sniper',
    name: 'Cycle End Sniper',
    description:
      'Times entries in the final 30-60 seconds before market resolution. When price strongly predicts outcome (>0.95 or <0.05), enters for near-certain payout with minimal exposure time.',
    category: 'statistical',
    riskLevel: 3,
    priceUsdMonthly: 8900, // $89/mo
    tags: ['cycle', 'sniper', 'polymarket', 'timing', 'resolution'],
    backtestSummary: { sharpe: 2.6, maxDrawdown: 3, winRate: 78, periodDays: 120, totalTrades: 280, totalPnlUsd: 7200 },
  },
  {
    id: 'delta-neutral-volatility-arbitrage',
    name: 'Delta-Neutral Volatility Arbitrage',
    description:
      'Delta-neutral volatility arbitrage using correlated market pairs. Opens hedged positions (long YES + long NO on correlated markets), monitors net delta, rebalances when threshold breached.',
    category: 'arbitrage',
    riskLevel: 4,
    priceUsdMonthly: 12900, // $129/mo
    tags: ['delta-neutral', 'volatility', 'arbitrage', 'polymarket', 'pairs'],
    backtestSummary: { sharpe: 2.1, maxDrawdown: 6, winRate: 65, periodDays: 90, totalTrades: 210, totalPnlUsd: 15600 },
  },
  {
    id: 'cross-event-drift-v2',
    name: 'Cross-Event Drift',
    description:
      'Detects significant moves in one market of an event group and trades the lagging correlated markets, expecting them to catch up. Uses gamma.getEvents() for group detection.',
    category: 'statistical',
    riskLevel: 4,
    priceUsdMonthly: 7900, // $79/mo
    tags: ['cross-event', 'drift', 'polymarket', 'correlation', 'event-group'],
    backtestSummary: { sharpe: 1.7, maxDrawdown: 9, winRate: 59, periodDays: 90, totalTrades: 150, totalPnlUsd: 5500 },
  },
  {
    id: 'resolution-frontrunner-v2',
    name: 'Resolution Frontrunner',
    description:
      'Front-runs market resolution by detecting strongly directional prices near endDate. When price > 0.85, buys YES expecting convergence to 1. When price < 0.15, buys NO expecting convergence to 0.',
    category: 'statistical',
    riskLevel: 3,
    priceUsdMonthly: 7900, // $79/mo
    tags: ['resolution', 'convergence', 'polymarket', 'low-risk'],
    backtestSummary: { sharpe: 2.4, maxDrawdown: 4, winRate: 72, periodDays: 180, totalTrades: 180, totalPnlUsd: 8800 },
  },
];

/**
 * Validate that seed entries have corresponding desk strategy implementations.
 * Logs warnings for seeds whose implementation file is missing.
 * Returns IDs of seeds that passed validation.
 */
export function validateSeedRegistry(): { valid: string[]; missing: string[] } {
  const valid: string[] = [];
  const missing: string[] = [];

  for (const seed of DESK_STRATEGIES) {
    const implPath = STRATEGY_IMPLEMENTATIONS[seed.id];
    if (!implPath) {
      logger.warn('Seed strategy has no implementation mapping', { id: seed.id, name: seed.name });
      missing.push(seed.id);
      continue;
    }

    const fullPath = resolve(DESK_STRATEGIES_ROOT, implPath);
    if (existsSync(fullPath)) {
      valid.push(seed.id);
    } else {
      logger.warn('Seed strategy implementation file missing', {
        id: seed.id,
        name: seed.name,
        expectedPath: implPath,
      });
      missing.push(seed.id);
    }
  }

  if (missing.length > 0) {
    logger.warn('Some seed strategies lack desk implementations — listings may be stale', {
      missing,
      total: DESK_STRATEGIES.length,
    });
  }

  logger.info('Desk strategy registry validation complete', {
    valid: valid.length,
    missing: missing.length,
  });

  return { valid, missing };
}

/**
 * Seed desk strategies into the marketplace. Idempotent — existing strategies
 * are left untouched. Validates implementation mapping before seeding; skips
 * seeds whose desk strategy files are missing.
 * Call at app startup or via admin script.
 */
export async function seedDeskStrategies(): Promise<{ created: number; skipped: number; staleWarnings: number }> {
  // Validate implementation mapping first
  const { missing } = validateSeedRegistry();
  const missingSet = new Set(missing);

  let created = 0;
  let skipped = 0;
  let staleWarnings = 0;

  for (const seed of DESK_STRATEGIES) {
    // Skip seeds whose desk implementation is missing
    if (missingSet.has(seed.id)) {
      logger.warn('Skipping seed with missing desk implementation', { id: seed.id, name: seed.name });
      staleWarnings++;
      continue;
    }

    try {
      // Skip if already exists
      const existing = await marketplaceService.getStrategy(seed.id);
      if (existing) {
        skipped++;
        continue;
      }

      // Create strategy
      await marketplaceService.createStrategy({
        id: seed.id,
        tenantId: SYSTEM_TENANT,
        creatorId: SYSTEM_CREATOR,
        name: seed.name,
        description: seed.description,
        category: seed.category,
        riskLevel: seed.riskLevel,
        minAllocationUsd: 1000,
        maxAllocationUsd: 100000,
        supportedExchanges: ['polymarket'],
        tags: seed.tags,
        backtestSummary: seed.backtestSummary,
      });

      // Auto-approve (system strategies bypass vetting)
      await marketplaceService.updateStrategyStatus(seed.id, 'approved');

      // Create listing
      await marketplaceService.createListing({
        strategyId: seed.id,
        tenantId: SYSTEM_TENANT,
        priceUsdMonthly: seed.priceUsdMonthly,
        billingCycle: 'monthly',
        isActive: true,
        status: 'active',
      });

      created++;
      logger.info('Seeded desk strategy', { id: seed.id, name: seed.name });
    } catch (err) {
      logger.error('Failed to seed desk strategy', { id: seed.id, err: String(err) });
    }
  }

  logger.info('Desk strategy seeding complete', { created, skipped, staleWarnings });
  return { created, skipped, staleWarnings };
}
