/**
 * Migration 025: Create Marketplace Schema
 * Establishes core marketplace tables for strategy publishing, subscriptions, reviews, revenue sharing.
 */

import type { PoolClient } from 'pg';
import { createMarketplaceCoreTables } from '../marketplace-schema-core-queries';
import {
  createMarketplaceAuxTables,
  dropMarketplaceTables,
} from '../marketplace-schema-aux-queries';

export const id = '025-create-marketplace-schema';
export const description = 'Create marketplace tables: strategies, listings, subscriptions, performance, reviews, revenue_shares, disputes';

export async function up(client: PoolClient): Promise<void> {
  await createMarketplaceCoreTables(client);
  await createMarketplaceAuxTables(client);
}

export async function down(client: PoolClient): Promise<void> {
  await dropMarketplaceTables(client);
}
