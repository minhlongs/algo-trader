/**
 * Tier 1: Signal Queue & Conflict Resolution Helper Facade
 */

import { registerTier1SignalIngestionTests } from './tier1-signal-ingestion.helper';
import { registerTier1QueueConflictTests } from './tier1-queue-conflict.helper';

export function registerTier1SignalQueueTests(): void {
  registerTier1SignalIngestionTests();
  registerTier1QueueConflictTests();
}

export { registerTier1SignalIngestionTests } from './tier1-signal-ingestion.helper';
export { registerTier1QueueConflictTests } from './tier1-queue-conflict.helper';
