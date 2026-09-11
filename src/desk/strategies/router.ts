/**
 * Strategy Router — Barrel Facade
 *
 * Routes strategy execution requests to appropriate shard Durable Objects
 * using consistent hashing for deterministic shard assignment.
 *
 * Previously a monolithic 297-LOC file. Extracted into two focused submodules:
 * - router-cache.ts — shard cache, hash utilities, getShardId/invalidateShardCache/pruneShardCache
 * - router-class.ts — StrategyRouter class + getStrategyRouter singleton factory
 */

export { getShardBindingName, getShardId, invalidateShardCache, pruneShardCache } from './router-cache';
export { StrategyRouter, getStrategyRouter } from './router-class';
