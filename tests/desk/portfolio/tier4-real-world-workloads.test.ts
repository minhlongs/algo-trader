/**
 * Tier 4: Real-World Workloads Test Suite
 *
 * Full end-to-end multi-asset simulated lifecycle scenarios:
 * 1. Multi-Engine Equilibrium Allocation
 * 2. Flash Crash & Multi-Tier Breaker Propagation
 * 3. Multi-Venue Water-Filling Execution
 * 4. Institutional Parent Order Slicing Gauntlet
 * 5. Zero Accounting Drift Multi-Engine Trading Session
 * 6. Non-Gaussian Jump Risk & Divergence Alarm
 * 7. Capital Starvation Lock & Rebalance Protection
 * 8. Automated EOD Cryptographic Ledger & Run-Card Archival
 *
 * Modularized with helper files to guarantee <= 200 visual LOC per file.
 */

process.env.VITEST_POOL_ID = '1';

import { describe } from 'vitest';
import { registerTier4Workloads1To4 } from './helpers/tier4-workloads-1-4.helper';
import { registerTier4Workloads5To8 } from './helpers/tier4-workloads-5-8.helper';

describe('Tier 4: Real-World Workloads Test Suite', () => {
  // Scenarios 1 - 4: Allocation, Circuit Breaker, Water-Filling & Order Slicing
  registerTier4Workloads1To4();

  // Scenarios 5 - 8: Drift Reconciler, Jump Risk, Starvation Protection & EOD Ledger
  registerTier4Workloads5To8();
});
