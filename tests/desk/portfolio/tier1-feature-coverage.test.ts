/**
 * Tier 1: Feature Coverage Test Suite (F1-F22)
 *
 * Covers all 22 features from PROJECT.md with 5 test cases per feature (110 total test cases).
 * Modularized with helper files to guarantee <= 200 visual LOC per file.
 */

process.env.VITEST_POOL_ID = '1';

import { describe } from 'vitest';
import { registerTier1AllocatorSolverTests } from './helpers/tier1-allocator-solver.helper';
import { registerTier1AllocatorServiceTests } from './helpers/tier1-allocator-service.helper';
import { registerTier1RiskVarTests } from './helpers/tier1-risk-var.helper';
import { registerTier1RiskBreakerTests } from './helpers/tier1-risk-breaker.helper';
import { registerTier1SorCoreTests } from './helpers/tier1-sor.helper';
import { registerTier1SorExecutorTests } from './helpers/tier1-sor-executors.helper';
import { registerTier1TelemetryAttributionTests } from './helpers/tier1-telemetry-attribution.helper';
import { registerTier1TelemetryBusLedgerTests } from './helpers/tier1-telemetry-bus-ledger.helper';

describe('Tier 1: Feature Coverage Test Suite (F1-F22)', () => {
  // F1 - F2: Dynamic Capital Allocator Parity & Covariance (10 tests)
  registerTier1AllocatorSolverTests();

  // F3 - F5: Tilts, Capital Buffer & Portfolio Allocator Service (15 tests)
  registerTier1AllocatorServiceTests();

  // F6 - F8: Global Risk Guard VaR, Tail Divergence & Leverage (15 tests)
  registerTier1RiskVarTests();

  // F9 - F10: 5-Tier Circuit Breaker & Engine Synchronizer (10 tests)
  registerTier1RiskBreakerTests();

  // F11 - F13: Smart Order Router Core Aggregation & Optimization (15 tests)
  registerTier1SorCoreTests();

  // F14 - F17: Order Splitting Strategies & Price Improvement (20 tests)
  registerTier1SorExecutorTests();

  // F18 - F20: Real-Time PnL Attribution, ROCE & Zero Drift Guard (15 tests)
  registerTier1TelemetryAttributionTests();

  // F21 - F22: Telemetry Bus & Automated EOD Risk Ledger (10 tests)
  registerTier1TelemetryBusLedgerTests();
});
