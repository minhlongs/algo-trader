/**
 * Multi-Engine Autonomous Desk Runner (`desk:auto`)
 * Tier 1: Feature Coverage Test Suite (F1 - F10)
 *
 * Enumerate all 10 features from TEST_INFRA.md with >= 5 test cases per feature (56 total tests).
 * Modularized with helper files to strictly guarantee <= 200 visual LOC per file.
 */

import { describe } from 'vitest';
import { registerTier1F1F2CliTests } from './helpers/tier1-f1-f2-cli.helper';
import { registerTier1F3F4FeedsTests } from './helpers/tier1-f3-f4-feeds.helper';
import { registerTier1F5F7SupervisorTests } from './helpers/tier1-f5-f7-supervisor.helper';
import { registerTier1F8F10TelemetryTests } from './helpers/tier1-f8-f10-telemetry.helper';

describe('Tier 1: Feature Coverage Test Suite (F1 - F10)', () => {
  // F1: CLI options validation (6 tests)
  // F2: CLI desk:status formatting and response (5 tests)
  registerTier1F1F2CliTests();

  // F3: Market data multiplexer streaming & mid-price calculations (6 tests)
  // F4: Feed freshness watchdog (normal ticks vs stale timeout) (6 tests)
  registerTier1F3F4FeedsTests();

  // F5: Concurrent 4-engine supervisor lifecycle (start, poll, stop) (5 tests)
  // F6: Daemon tick loop & priority ingestion (6 tests)
  // F7: Emergency halt execution <= 100ms (5 tests)
  registerTier1F5F7SupervisorTests();

  // F8: Prometheus metric registry & gauges (5 tests)
  // F9: HTTP server endpoints (/health, /status, /metrics, /api/desk/allocations) (6 tests)
  // F10: Zero accounting drift invariant verification (6 tests)
  registerTier1F8F10TelemetryTests();
});
