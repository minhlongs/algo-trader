/**
 * Tier 2: Boundary Conditions & Corner Cases Test Suite
 *
 * Covers all 17 features (F1-F17) across R1-R4 with >=5 boundary/corner test cases per feature (85 total).
 * Tests extreme drawdown, zero trades, adverse cost stress, regime shock, boundary Sharpe,
 * floating point tolerances, and invalid state resilience.
 */

process.env.VITEST_POOL_ID = '1';

import { describe } from 'vitest';
import { registerTier2DiscoveryTests } from './helpers/tier2-discovery.helper';
import { registerTier2GatesTests } from './helpers/tier2-gates.helper';
import { registerTier2LifecycleTests } from './helpers/tier2-lifecycle.helper';
import { registerTier2ExecutionTests } from './helpers/tier2-execution.helper';
import { registerTier2ProvenanceTests } from './helpers/tier2-provenance.helper';

describe('Tier 2: Boundary Conditions & Corner Cases Test Suite (F1-F17)', () => {
  registerTier2DiscoveryTests();
  registerTier2GatesTests();
  registerTier2LifecycleTests();
  registerTier2ExecutionTests();
  registerTier2ProvenanceTests();
});
