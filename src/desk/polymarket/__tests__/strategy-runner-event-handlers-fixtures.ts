/**
 * Shared Test Builders for Strategy Runner Event Handlers
 */

import { vi } from 'vitest';
import type { EventHandlerContext } from '../strategy-runner-event-handlers';

export function buildEventHandlerCtx(
  mockStrategy: { execute: ReturnType<typeof vi.fn> },
  overrides: Partial<EventHandlerContext> = {},
): EventHandlerContext {
  return {
    status: 'running',
    strategy: mockStrategy as unknown as EventHandlerContext['strategy'],
    config: {
      maxTicks: 0,
      minExecutionIntervalMs: 50,
    } as unknown as EventHandlerContext['config'],
    strategyName: 'test-strategy',
    executionCount: 0,
    lastExecutionTime: 0,
    trackedTokens: { has: () => false, size: 0 },
    updateLastExecutionTime: vi.fn(),
    incrementExecutionCount: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

export function buildPricePayload(
  overrides: Partial<{ tokenId: string; bid: number; ask: number; timestamp: number }> = {},
) {
  return {
    tokenId: 'yes-token',
    bid: 0.5,
    ask: 0.51,
    timestamp: Date.now(),
    ...overrides,
  };
}
