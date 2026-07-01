/**
 * Desk Strategy Marketplace Seeder
 *
 * Creates marketplace listings for operator-owned desk strategies so they
 * appear in the subscriber marketplace. Uses system tenant ID since desk
 * strategies are operator-owned, not created by marketplace providers.
 *
 * Idempotent — skips if strategy ID already exists.
 */

import { logger } from '../../../shared/utils/logger';
import { marketplaceService } from './marketplace.service';

const SYSTEM_TENANT = 'system';
const SYSTEM_CREATOR = 'operator';

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
];

/**
 * Seed desk strategies into the marketplace. Idempotent — existing strategies
 * are left untouched. Call at app startup or via admin script.
 */
export async function seedDeskStrategies(): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const seed of DESK_STRATEGIES) {
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

  logger.info('Desk strategy seeding complete', { created, skipped });
  return { created, skipped };
}
