/**
 * Tier 3: Pairwise & Cross-Feature Integration Test Suite
 *
 * Validates cross-module contracts and state transitions across:
 * - Discovery -> Signal Generation & Adapter (R1 -> R2)
 * - Signal Generation -> RegimeAwareKelly -> Paper Execution (R2 -> R2)
 * - Paper Trading -> Promotion State Machine & 10+1 Gates (R2 -> R3)
 * - Promoted Alpha -> LiveExecutionGuard Pre-Trade Risk Verification (R3 -> R3)
 * - Complete Pipeline Execution -> SHA-256 Chained Research Ledger & Run Card (R4 -> R4)
 */

process.env.VITEST_POOL_ID = '1';

import { describe } from 'vitest';
import { registerTier3DiscoveryExecutionTests } from './helpers/tier3-discovery-execution.helper';
import { registerTier3GatesLifecycleTests } from './helpers/tier3-gates-lifecycle.helper';
import { registerTier3RiskProvenanceTests } from './helpers/tier3-risk-provenance.helper';

describe('Tier 3: Pairwise & Cross-Feature Integration Test Suite (R1-R4)', () => {
  registerTier3DiscoveryExecutionTests();
  registerTier3GatesLifecycleTests();
  registerTier3RiskProvenanceTests();
});
