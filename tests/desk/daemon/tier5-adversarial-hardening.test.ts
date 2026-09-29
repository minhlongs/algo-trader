/**
 * Tier 5: Adversarial Hardening Test Suite
 * Multi-Engine Autonomous Desk Runner (`desk:auto`)
 *
 * Implements >= 10 adversarial chaos tests:
 * 1. Simultaneous multi-venue feed disconnection
 * 2. Corrupted book snapshots with negative prices
 * 3. Inverted order book (bid > ask crossed market)
 * 4. NaN, Infinity, and zero price ticks filtering
 * 5. HTTP status server fuzzing with invalid methods
 * 6. HTTP path traversal attacks
 * 7. Rapid SIGINT flooding during emergency halt
 * 8. Float jitter summation with repeating fractions
 * 9. Extreme capital scale ($10^14) & sub-satoshi allocations
 * 10. Unresponsive engine throwing unhandled error during pollCycle
 * 11. Repeatedly failing engine transitions and recovery
 * 12. High-concurrency intent queue flood & backpressure shedding
 * 13. Dead-man switch trip latching preventing state flapping
 */

import { registerTier5FeedHttpTests } from './helpers/tier5-adversarial-feed-http.helper';
import { registerTier5DriftEngineTests } from './helpers/tier5-adversarial-drift-engine.helper';

registerTier5FeedHttpTests();
registerTier5DriftEngineTests();
