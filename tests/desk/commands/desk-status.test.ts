import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  runDeskStatus,
  formatHumanReadableDeskStatus,
  DeskStatusPayload,
} from '../../../src/desk/commands/desk-status';
import { logger } from '../../../src/shared/utils/logger';

describe('desk:status Command & Telemetry Inspector Suite', () => {
  const mockStatusPayload: DeskStatusPayload = {
    status: 'RUNNING',
    mode: 'PAPER',
    circuitBreakerTier: 'NORMAL',
    navUsd: 100_000,
    allocatedCapitalUsd: {
      arbitrage: 20_000,
      marl: 25_000,
      amm: 20_000,
      'alpha-lab': 15_000,
    },
    unallocatedCashUsd: 20_000,
    driftUsd: 0.000012,
    uptimeSeconds: 120,
    cycleCount: 60,
    engines: {
      arbitrage: { status: 'ACTIVE', activeOrders: 2 },
      marl: { status: 'ACTIVE', activeOrders: 4 },
      amm: { status: 'ACTIVE', activeOrders: 1 },
      alphaLab: { status: 'ACTIVE', activeOrders: 0 },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Status Query Execution', () => {
    it('successfully queries daemon status on default port 9100', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => mockStatusPayload,
      });

      const result = await runDeskStatus({ fetchFn: mockFetch });

      expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:9100/status', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      expect(result.ok).toBe(true);
      expect(result.url).toBe('http://127.0.0.1:9100/status');
      expect(result.data?.status).toBe('RUNNING');
      expect(result.data?.navUsd).toBe(100_000);
    });

    it('queries custom host and port when specified', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => mockStatusPayload,
      });

      const result = await runDeskStatus({
        host: '10.0.0.5',
        port: 9205,
        fetchFn: mockFetch,
      });

      expect(mockFetch).toHaveBeenCalledWith('http://10.0.0.5:9205/status', expect.any(Object));
      expect(result.url).toBe('http://10.0.0.5:9205/status');
    });

    it('formats human-readable summary output by default', async () => {
      const loggerSpy = vi.spyOn(logger, 'info');
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => mockStatusPayload,
      });

      const result = await runDeskStatus({ fetchFn: mockFetch });
      expect(result.ok).toBe(true);

      const loggedCalls = loggerSpy.mock.calls.map((call) => call[0]);
      expect(loggedCalls.some((c) => typeof c === 'string' && c.includes('Autonomous Desk Status'))).toBe(true);
      expect(loggedCalls.some((c) => typeof c === 'string' && c.includes('Daemon State:       RUNNING'))).toBe(true);
      expect(loggedCalls.some((c) => typeof c === 'string' && c.includes('Portfolio NAV:      $100,000'))).toBe(true);
      expect(loggedCalls.some((c) => typeof c === 'string' && c.includes('arbitrage: ACTIVE'))).toBe(true);
    });

    it('outputs raw JSON format when json flag is true', async () => {
      const loggerSpy = vi.spyOn(logger, 'info');
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => mockStatusPayload,
      });

      const result = await runDeskStatus({ json: true, fetchFn: mockFetch });
      expect(result.ok).toBe(true);

      const loggedCalls = loggerSpy.mock.calls.map((call) => call[0]);
      expect(loggedCalls).toContain(JSON.stringify(mockStatusPayload, null, 2));
    });
  });

  describe('Error Handling', () => {
    it('returns error result when server returns non-200 HTTP code', async () => {
      const loggerErrorSpy = vi.spyOn(logger, 'error');
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      const result = await runDeskStatus({ fetchFn: mockFetch });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('HTTP 503 Service Unavailable');
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('handles network connection failure gracefully when daemon is offline', async () => {
      const loggerErrorSpy = vi.spyOn(logger, 'error');
      const mockFetch = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:9100'));

      const result = await runDeskStatus({ fetchFn: mockFetch });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('ECONNREFUSED');
      expect(loggerErrorSpy).toHaveBeenCalled();
    });
  });

  describe('formatHumanReadableDeskStatus Utility', () => {
    it('renders desk status even when optional fields are omitted', () => {
      const loggerSpy = vi.spyOn(logger, 'info');
      formatHumanReadableDeskStatus({}, 9100);

      const calls = loggerSpy.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => typeof c === 'string' && c.includes('Daemon State:       UNKNOWN'))).toBe(true);
      expect(calls.some((c) => typeof c === 'string' && c.includes('Circuit Breaker:    NORMAL'))).toBe(true);
    });
  });

  describe('Commander Registration in src/index.ts', () => {
    it('registers desk:status with port and json options', async () => {
      const { buildCliProgram } = await import('../../../src/index');
      const program = buildCliProgram();
      const cmd = program.commands.find((c) => c.name() === 'desk:status');

      expect(cmd).toBeDefined();
      const optionNames = cmd?.options.map((o) => o.attributeName());
      expect(optionNames).toContain('port');
      expect(optionNames).toContain('json');

      const portOpt = cmd?.options.find((o) => o.attributeName() === 'port');
      expect(portOpt?.defaultValue).toBe('9100');
    });
  });
});
