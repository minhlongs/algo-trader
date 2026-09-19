import { vi } from 'vitest';

// Mock the postgres client and logger
vi.mock('../../../db/postgres-client.js', () => ({
  query: vi.fn(),
}));
vi.mock('../../../utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
  },
}));

import { query as pgQuery } from '../../../db/postgres-client.js';
import { logger } from '../../../utils/logger.js';

export const q = vi.mocked(pgQuery);
export const logError = vi.mocked(logger.error);

export function consensus(overrides: {
  action?: 'enter_long' | 'enter_short' | 'hold';
  confidence?: number;
  weightedBullScore?: number;
  weightedBearScore?: number;
  regime?: string;
  emittedAt?: number;
  reason?: string;
  tfSignals?: unknown[];
} = {}): Record<string, unknown> {
  return {
    action: overrides.action ?? 'enter_long',
    confidence: overrides.confidence ?? 0.8,
    weightedBullScore: overrides.weightedBullScore ?? 0.9,
    weightedBearScore: overrides.weightedBearScore ?? 0.1,
    regime: overrides.regime ?? 'trending_up',
    emittedAt: overrides.emittedAt ?? 1_700_000_000_000,
    reason: overrides.reason ?? 'consensus=long agreement=3/3',
    tfSignals: overrides.tfSignals ?? [],
  };
}

export function consensusEvent(signalOverrides: Parameters<typeof consensus>[0] = {}) {
  return {
    type: 'consensus_computed' as const,
    signal: consensus(signalOverrides),
  };
}
