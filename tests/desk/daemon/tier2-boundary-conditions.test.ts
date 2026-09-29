/**
 * Multi-Engine Autonomous Desk Runner (`desk:auto`)
 * Tier 2: Boundary Conditions Test Suite
 *
 * Covers >= 50 tests addressing boundary capital values, empty inputs,
 * minimum poll intervals, extreme tick latencies, ports, zero drift, and queue capacities.
 * Strictly adheres to <= 200 visual LOC per file and 0 :any types.
 */

import { describe } from 'vitest';
import { registerTier2CliConfigTests } from './helpers/tier2-bva-cli-config.helper';
import { registerTier2LatencyWatchdogTests } from './helpers/tier2-latency-watchdog.helper';
import { registerTier2DriftQueueTests } from './helpers/tier2-drift-queue.helper';

describe('Tier 2: Boundary Conditions Test Suite', () => {
  // BVA: Capital, intervals, ports, symbols, exchanges (28 tests)
  registerTier2CliConfigTests();

  // BVA: Extreme tick latencies, watchdog tripwires, heartbeats (15 tests)
  registerTier2LatencyWatchdogTests();

  // BVA: Zero accounting drift, priority queue capacity, intent expiry (19 tests)
  registerTier2DriftQueueTests();
});
