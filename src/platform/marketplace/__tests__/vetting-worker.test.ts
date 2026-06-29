/**
 * Vetting Worker Tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VettingWorker } from '../workers/vetting-worker';

// Mock VettingService — capture the factory so tests control the return value
const mockVettingService = {
  getPendingStrategies: vi.fn(),
  runVettingChecks: vi.fn(),
  recordDecision: vi.fn(),
};

vi.mock('../services/vetting.service', () => ({
  VettingService: {
    getInstance: vi.fn(() => mockVettingService),
  },
}));

describe('VettingWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVettingService.getPendingStrategies.mockResolvedValue([]);
    mockVettingService.runVettingChecks.mockResolvedValue({ approved: true, score: 100, feedback: 'OK', checks: [] });
    mockVettingService.recordDecision.mockResolvedValue({ id: 'strat_001', status: 'approved' });
    vi.useFakeTimers();
    // Reset singleton so each test gets a fresh worker
    (VettingWorker as any).instance = null;
  });

  it('should be a singleton', () => {
    const w1 = VettingWorker.getInstance();
    const w2 = VettingWorker.getInstance();
    expect(w1).toBe(w2);
  });

  it('should start and be running', () => {
    const worker = VettingWorker.getInstance({ pollIntervalMs: 60_000 });
    worker.start();
    expect(worker.isRunning).toBe(true);
    worker.stop();
  });

  it('should stop cleanly', () => {
    const worker = VettingWorker.getInstance({ pollIntervalMs: 60_000 });
    worker.start();
    worker.stop();
    expect(worker.isRunning).toBe(false);
  });

  it('should not double-start', () => {
    const worker = VettingWorker.getInstance({ pollIntervalMs: 60_000 });
    worker.start();
    worker.start();
    expect(worker.isRunning).toBe(true);
    worker.stop();
  });

  it('should process pending strategies on start', async () => {
    mockVettingService.getPendingStrategies.mockResolvedValue([
      { id: 'strat_001', name: 'Test Strategy' },
    ]);
    mockVettingService.runVettingChecks.mockResolvedValue({ approved: true, score: 100, feedback: 'All good', checks: [] });
    mockVettingService.recordDecision.mockResolvedValue({ id: 'strat_001', status: 'approved' });

    const worker = VettingWorker.getInstance({ pollIntervalMs: 60_000 });
    worker.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockVettingService.getPendingStrategies).toHaveBeenCalledWith({ limit: 10 });
    expect(mockVettingService.runVettingChecks).toHaveBeenCalledWith('strat_001');
    expect(mockVettingService.recordDecision).toHaveBeenCalledWith('strat_001', true, 'system', 'All good');
    worker.stop();
  });

  it('should handle empty pending list gracefully', async () => {
    mockVettingService.getPendingStrategies.mockResolvedValue([]);

    const worker = VettingWorker.getInstance({ pollIntervalMs: 60_000 });
    worker.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockVettingService.runVettingChecks).not.toHaveBeenCalled();
    worker.stop();
  });

  it('should continue processing other strategies when one fails', async () => {
    mockVettingService.getPendingStrategies.mockResolvedValue([
      { id: 'strat_001', name: 'Good Strategy' },
      { id: 'strat_002', name: 'Bad Strategy' },
    ]);
    mockVettingService.runVettingChecks
      .mockResolvedValueOnce({ approved: true, score: 100, feedback: 'OK', checks: [] })
      .mockRejectedValueOnce(new Error('DB error'));
    mockVettingService.recordDecision.mockResolvedValue({ id: 'strat_001', status: 'approved' });

    const worker = VettingWorker.getInstance({ pollIntervalMs: 60_000 });
    worker.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockVettingService.runVettingChecks).toHaveBeenCalledTimes(2);
    expect(mockVettingService.recordDecision).toHaveBeenCalledTimes(1);
    worker.stop();
  });

  it('should use custom batch size', async () => {
    mockVettingService.getPendingStrategies.mockResolvedValue([]);

    const worker = VettingWorker.getInstance({ pollIntervalMs: 60_000, maxBatchSize: 5 });
    worker.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockVettingService.getPendingStrategies).toHaveBeenCalledWith({ limit: 5 });
    worker.stop();
  });
});
