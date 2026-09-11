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
import { resolve } from 'path';
import { logger } from '../../../shared/utils/logger';
import { marketplaceService } from './marketplace.service';
import {
  DESK_STRATEGIES_ROOT,
  STRATEGY_IMPLEMENTATIONS,
  type DeskStrategySeed,
} from './desk-strategy-seeder-types';
import { DESK_STRATEGIES } from './desk-strategy-seeder-data';

export type { DeskStrategySeed } from './desk-strategy-seeder-types';

const SYSTEM_TENANT = 'system';
const SYSTEM_CREATOR = 'operator';

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
