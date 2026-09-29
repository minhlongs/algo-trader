/**
 * Tier 1: Feature Coverage Test Suite (F1-F17)
 *
 * Covers all 17 features from PROJECT.md with 5 test cases per feature (85 total test cases).
 * Modularized with helper files to guarantee <= 200 visual LOC per file.
 */

process.env.VITEST_POOL_ID = '1';

import { describe } from 'vitest';
import { registerTier1DiscoveryTests } from './helpers/tier1-discovery.helper';
import { registerTier1GatesTests } from './helpers/tier1-gates.helper';
import { registerTier1LifecycleTests } from './helpers/tier1-lifecycle.helper';
import { registerTier1ExecutionTests } from './helpers/tier1-execution.helper';
import { registerTier1ProvenanceTests } from './helpers/tier1-provenance.helper';

describe('Tier 1: Feature Coverage Test Suite (F1-F17)', () => {
  // Discovery & Walkforward (F1 - F4: 20 tests)
  registerTier1DiscoveryTests();

  // Survival Gates & Overfitting Filters (F5 - F8: 20 tests)
  registerTier1GatesTests();

  // Lifecycle State Machine & Promotion (F9 - F11: 15 tests)
  registerTier1LifecycleTests();

  // Signal Transformation, Paper Execution & Risk (F12 - F15: 20 tests)
  registerTier1ExecutionTests();

  // Provenance Ledger & Run-Card Archival (F16 - F17: 10 tests)
  registerTier1ProvenanceTests();
});
