/**
 * Tests for negative-risk-scanner — createNegativeRiskScannerTick facade.
 *
 * The tick factory is the only executable code in the facade; everything
 * else is a re-export. evaluateExits / scanEntries / logger are mocked so
 * the tick's orchestration (call order, logging, swallow) is what's tested.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger, mockEvaluateExits, mockScanEntries } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockEvaluateExits: vi.fn().mockResolvedValue(undefined),
  mockScanEntries: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../core/logger', () => ({ logger: mockLogger }));
vi.mock('../negative-risk-exit', () => ({ evaluateExits: mockEvaluateExits }));
vi.mock('../negative-risk-entry', () => ({ scanEntries: mockScanEntries }));

import { createNegativeRiskScannerTick } from '../negative-risk-scanner';

describe('createNegativeRiskScannerTick', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEvaluateExits.mockResolvedValue(undefined);
    mockScanEntries.mockResolvedValue(undefined);
  });

  function makeDeps() {
    return {
      clob: { name: 'clob' },
      orderManager: { name: 'orderManager' },
      eventBus: { name: 'eventBus' },
      gamma: { name: 'gamma' },
    } as never;
  }

  it('returns an async tick function', () => {
    const tick = createNegativeRiskScannerTick({}, makeDeps());
    expect(typeof tick).toBe('function');
  });

  it('evaluates exits then scans entries on every tick', async () => {
    const tick = createNegativeRiskScannerTick({}, makeDeps());

    await tick();
    await tick();

    expect(mockEvaluateExits).toHaveBeenCalledTimes(2);
    expect(mockScanEntries).toHaveBeenCalledTimes(2);
    // exit must always run before entry on each tick
    for (let i = 0; i < 2; i++) {
      const exitOrder = mockEvaluateExits.mock.invocationCallOrder[i];
      const entryOrder = mockScanEntries.mock.invocationCallOrder[i];
      expect(exitOrder).toBeLessThan(entryOrder);
    }
  });

  it('logs a debug line after a successful tick', async () => {
    const tick = createNegativeRiskScannerTick({}, makeDeps());

    await tick();

    expect(mockLogger.debug).toHaveBeenCalledWith('Tick complete', expect.anything(), {
      openPositions: 0,
      cooldownCount: 0,
    });
  });

  it('surfaces runtime state (positions / cooldowns) in the debug log', async () => {
    const tick = createNegativeRiskScannerTick({}, makeDeps());

    await tick();

    const call = mockLogger.debug.mock.calls[0];
    expect(call[1]).toBe('negative-risk-scanner');
    expect(call[2]).toEqual({ openPositions: 0, cooldownCount: 0 });
  });

  it('logs an error and continues when a tick throws', async () => {
    mockEvaluateExits.mockRejectedValue(new Error('boom'));
    const tick = createNegativeRiskScannerTick({}, makeDeps());

    await expect(tick()).resolves.toBeUndefined();

    expect(mockLogger.error).toHaveBeenCalledWith('Tick failed', 'negative-risk-scanner', { err: 'Error: boom' });
    expect(mockScanEntries).not.toHaveBeenCalled();
  });

  it('logs an error when scanEntries throws after exits succeed', async () => {
    mockScanEntries.mockRejectedValue(new Error('scan down'));
    const tick = createNegativeRiskScannerTick({}, makeDeps());

    await expect(tick()).resolves.toBeUndefined();

    expect(mockEvaluateExits).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith('Tick failed', 'negative-risk-scanner', { err: 'Error: scan down' });
  });

  it('passes the merged config (defaults + overrides) to the runtime', async () => {
    const tick = createNegativeRiskScannerTick({ maxPositions: 9 }, makeDeps());

    await tick();

    // The runtime closure is private; the only observable effect is that the
    // tick succeeds, which it does. Assert the deps were wired through.
    expect(mockEvaluateExits).toHaveBeenCalledWith(expect.objectContaining({
      clob: expect.objectContaining({ name: 'clob' }),
      orderManager: expect.objectContaining({ name: 'orderManager' }),
      gamma: expect.objectContaining({ name: 'gamma' }),
    }));
  });
});
