/**
 * Tier 2: Boundary Conditions Test Suite (F1-F22)
 *
 * Covers boundary and corner cases for all 22 features with >= 5 tests per feature (110 total tests).
 * Modularized with helper files to guarantee <= 200 visual LOC per file.
 */

process.env.VITEST_POOL_ID = '1';

import { describe } from 'vitest';
import { registerTier2AllocatorSolverTests } from './helpers/tier2-allocator-solver.helper';
import { registerTier2AllocatorServiceTests } from './helpers/tier2-allocator-service.helper';
import { registerTier2RiskVarTests } from './helpers/tier2-risk-var.helper';
import { registerTier2RiskBreakerTests } from './helpers/tier2-risk-breaker.helper';
import { registerTier2SorCoreTests } from './helpers/tier2-sor-core.helper';
import { registerTier2SorExecutorTests } from './helpers/tier2-sor-executors.helper';
import { registerTier2TelemetryTests } from './helpers/tier2-telemetry.helper';

describe('Tier 2: Boundary Conditions Test Suite (F1-F22)', () => {
  // F1 - F2: Allocator Solver & Covariance Boundaries (10 tests)
  registerTier2AllocatorSolverTests();

  // F3 - F5: Tilts, Buffer Guard & Allocator Service Boundaries (15 tests)
  registerTier2AllocatorServiceTests();

  // F6 - F8: VaR, Tail Divergence & Leverage Boundaries (15 tests)
  registerTier2RiskVarTests();

  // F9 - F10: Circuit Breaker & Engine Synchronizer Boundaries (10 tests)
  registerTier2RiskBreakerTests();

  // F11 - F13: SOR Aggregation, Water-Filling & Gate Boundaries (15 tests)
  registerTier2SorCoreTests();

  // F14 - F17: Execution Strategies & Price Improvement Boundaries (20 tests)
  registerTier2SorExecutorTests();

  // F18 - F22: Telemetry, Margin, Drift Guard & EOD Ledger Boundaries (25 tests)
  registerTier2TelemetryTests();
});
