/**
 * Tier 4: Real-World Workloads Test Suite
 * Multi-Engine Autonomous Desk Runner (`desk:auto`)
 *
 * Implements 5 comprehensive real-world application scenarios from TEST_INFRA.md:
 * 1. Full Paper Day Trading Session
 * 2. Feed Blackout & Dead-Man Tripwire
 * 3. Operator Graceful Termination
 * 4. Rapid Multi-Engine Arbitrage & Volatility Spike
 * 5. HTTP Status & Prometheus Telemetry Query
 */

import { registerTier4SessionLifecycleTests } from './helpers/tier4-session-lifecycle.helper';
import { registerTier4VolatilityTelemetryTests } from './helpers/tier4-volatility-telemetry.helper';

registerTier4SessionLifecycleTests();
registerTier4VolatilityTelemetryTests();
