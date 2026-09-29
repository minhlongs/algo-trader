/**
 * Multi-Engine Autonomous Desk Runner (`desk:auto`)
 * Tier 3: Cross-Feature Combination Test Suite
 *
 * Covers >= 15 pairwise cross-feature tests exercising watchdog trips during polling,
 * emergency halts with pending queue items, dynamic mid-pricing across order books,
 * conflicting multi-engine intents, HTTP status during state transitions, and telemetry scrapes.
 * Strictly adheres to <= 200 visual LOC per file and 0 :any types.
 */

import { describe } from 'vitest';
import { registerTier3LifecycleTests } from './helpers/tier3-cross-lifecycle.helper';
import { registerTier3PricingTests } from './helpers/tier3-cross-pricing.helper';

describe('Tier 3: Cross-Feature Combination Test Suite', () => {
  // Cross-Feature 1-8: Lifecycle, Watchdog, Halt, Engine Errors, HTTP status transitions
  registerTier3LifecycleTests();

  // Cross-Feature 9-16: Mid-Price Crossing, Conflicting Intents, Drift during Rebalance, Telemetry Scrapes
  registerTier3PricingTests();
});
