/**
 * Whale Tracker V2 — Barrel Facade
 *
 * Previously a monolithic 302-LOC file. Extracted into two focused submodules:
 * - whale-tracker-v2-helpers.ts  — config types + pure computation functions
 * - whale-tracker-v2-strategy.ts — WhaleTrackerStrategy class + factory
 */

export * from './whale-tracker-v2-helpers';
export * from './whale-tracker-v2-strategy';

// Explicit re-export for validate-strategies.mjs text-search compatibility
export { createWhaleTrackerTick } from './whale-tracker-v2-strategy';
