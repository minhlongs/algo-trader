/**
 * Tier 5: Adversarial Hardening Test Suite
 *
 * White-box mathematical stress testing, degenerate matrices, flash crash replay,
 * Byzantine timeouts, and extreme chaotic boundary conditions:
 * - ADV-1 to ADV-10: Mathematical & Execution Stress
 * - ADV-11 to ADV-20: Chaos & Byzantine Faults
 *
 * Modularized with helper files to guarantee <= 200 visual LOC per file.
 */

process.env.VITEST_POOL_ID = '1';

import { describe } from 'vitest';
import { registerTier5AdversarialMathTests } from './helpers/tier5-adversarial-math.helper';
import { registerTier5AdversarialChaosTests } from './helpers/tier5-adversarial-chaos.helper';

describe('Tier 5: Adversarial Hardening Test Suite', () => {
  // ADV-1 to ADV-10: Mathematical & Execution Stress (10 tests)
  registerTier5AdversarialMathTests();

  // ADV-11 to ADV-20: Chaos & Byzantine Faults (10 tests)
  registerTier5AdversarialChaosTests();
});
