/**
 * Kronos Sidecar Monitor Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkSidecarHealth, isSidecarHealthy, startSidecarMonitor, stopSidecarMonitor } from '../kronos-sidecar-monitor';

// Mock alphaear client
vi.mock('../alphaear-client', () => ({
  alphaear: {
    checkHealth: vi.fn(),
  },
}));

import { alphaear } from '../alphaear-client';

describe('KronosSidecarMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopSidecarMonitor();
  });

  afterEach(() => {
    stopSidecarMonitor();
  });

  describe('checkSidecarHealth', () => {
    it('should return true when sidecar is healthy', async () => {
      vi.mocked(alphaear.checkHealth).mockResolvedValue({
        status: 'healthy',
        kronos_loaded: true,
        finbert_loaded: true,
        news_sources: 14,
        polymarket_api: true,
      });

      const result = await checkSidecarHealth();
      expect(result).toBe(true);
      expect(isSidecarHealthy()).toBe(true);
    });

    it('should return false when sidecar is unreachable', async () => {
      vi.mocked(alphaear.checkHealth).mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await checkSidecarHealth();
      expect(result).toBe(false);
      expect(isSidecarHealthy()).toBe(false);
    });

    it('should return false when health check returns null', async () => {
      vi.mocked(alphaear.checkHealth).mockResolvedValue(null);

      const result = await checkSidecarHealth();
      expect(result).toBe(false);
    });
  });

  describe('startSidecarMonitor', () => {
    it('should not start twice', async () => {
      vi.mocked(alphaear.checkHealth).mockResolvedValue({
        status: 'healthy',
        kronos_loaded: true,
        finbert_loaded: true,
        news_sources: 14,
        polymarket_api: true,
      });

      startSidecarMonitor();
      startSidecarMonitor(); // second call should be no-op

      // Wait a bit for async health check
      await new Promise(r => setTimeout(r, 50));

      stopSidecarMonitor();
    });
  });
});
