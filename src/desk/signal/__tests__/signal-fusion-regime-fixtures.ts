/**
 * Fixtures for signal fusion regime tests.
 */

import type { SignalInput } from '../../intelligence/signal-fusion-engine';

export function makeSignal(overrides: Partial<SignalInput> = {}): SignalInput {
  return {
    name: 'momentum-macd',
    score: 0.5,
    weight: 1.0,
    ...overrides,
  };
}
