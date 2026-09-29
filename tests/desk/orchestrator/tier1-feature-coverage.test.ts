/**
 * Tier 1: Feature Coverage Test Suite (F1 - F19)
 *
 * Covers all 19 features from PROJECT.md with >= 5 test cases per feature (95 total test cases).
 * Modularized with helper files to guarantee <= 200 visual LOC per file.
 */

process.env.VITEST_POOL_ID = '1';

import { describe } from 'vitest';
import { registerTier1SignalQueueTests } from './helpers/tier1-signal-queue.helper';
import { registerTier1RiskBudgetTests } from './helpers/tier1-risk-budget.helper';
import { registerTier1RiskGateTests } from './helpers/tier1-risk-gate.helper';
import { registerTier1SorDispatcherTests } from './helpers/tier1-sor-dispatcher.helper';
import { registerTier1TelemetryLifecycleTests } from './helpers/tier1-telemetry-lifecycle.helper';

describe('Tier 1: Feature Coverage Test Suite (F1 - F19)', () => {
  // F1 - F5: Signal Multiplexing, Priority Queue & Conflict Resolution (25 tests)
  registerTier1SignalQueueTests();

  // F6 - F7: Pre-Trade Capital Allocation & Liquid Cash Buffer Guard (10 tests)
  registerTier1RiskBudgetTests();

  // F8 - F9: Synchronized Circuit Breaker Gate & Leverage/Concentration Guard (10 tests)
  registerTier1RiskGateTests();

  // F10 - F13: Tri-Mode Multi-Venue Order Dispatcher & SOR Reconciler (20 tests)
  registerTier1SorDispatcherTests();

  // F14 - F19: Telemetry, Zero-Drift, Autonomous Lifecycle & Master Loop (30 tests)
  registerTier1TelemetryLifecycleTests();
});
