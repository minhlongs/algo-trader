import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DeskAutoConfigSchema,
  parseDeskAutoConfig,
  IDeskDaemon,
} from '../../../src/desk/commands/desk-auto-types';
import { runDeskAuto, StubDeskDaemon } from '../../../src/desk/commands/desk-auto';

describe('desk-auto Command & Configuration Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('DeskAutoConfigSchema & Parser', () => {
    it('applies standard institutional defaults when input is empty', () => {
      const config = DeskAutoConfigSchema.parse({});
      expect(config.mode).toBe('PAPER');
      expect(config.capitalUsd).toBe(100_000);
      expect(config.dryRun).toBe(true);
      expect(config.exchanges).toEqual(['binance', 'bybit', 'polymarket']);
      expect(config.symbols).toEqual(['BTC/USDT', 'ETH/USDT']);
      expect(config.pollIntervalMs).toBe(1000);
      expect(config.metricsPort).toBe(9100);
      expect(config.durationSeconds).toBeUndefined();
    });

    it('normalizes CLI string inputs into typed fields', () => {
      const parsed = parseDeskAutoConfig({
        mode: 'shadow',
        capital: '250000',
        dryRun: false,
        exchanges: 'binance, bybit',
        symbols: 'SOL/USDT, AVAX/USDT',
        pollInterval: '250',
        metricsPort: '9200',
        duration: '15',
      });

      expect(parsed.mode).toBe('SHADOW');
      expect(parsed.capitalUsd).toBe(250_000);
      expect(parsed.dryRun).toBe(false);
      expect(parsed.exchanges).toEqual(['binance', 'bybit']);
      expect(parsed.symbols).toEqual(['SOL/USDT', 'AVAX/USDT']);
      expect(parsed.pollIntervalMs).toBe(250);
      expect(parsed.metricsPort).toBe(9200);
      expect(parsed.durationSeconds).toBe(15);
    });

    it('rejects invalid inputs on boundary limits', () => {
      expect(() => DeskAutoConfigSchema.parse({ mode: 'INVALID' })).toThrow();
      expect(() => DeskAutoConfigSchema.parse({ capitalUsd: -500 })).toThrow();
      expect(() => DeskAutoConfigSchema.parse({ capitalUsd: 0 })).toThrow();
      expect(() => DeskAutoConfigSchema.parse({ exchanges: [] })).toThrow();
      expect(() => DeskAutoConfigSchema.parse({ symbols: [] })).toThrow();
      expect(() => DeskAutoConfigSchema.parse({ pollIntervalMs: 40 })).toThrow();
      expect(() => DeskAutoConfigSchema.parse({ metricsPort: 1023 })).toThrow();
      expect(() => DeskAutoConfigSchema.parse({ metricsPort: 65536 })).toThrow();
      expect(() => DeskAutoConfigSchema.parse({ durationSeconds: -1 })).toThrow();
    });
  });

  describe('StubDeskDaemon Lifecycle', () => {
    it('initializes, starts, steps, and stops with accurate status', async () => {
      const config = parseDeskAutoConfig({ capitalUsd: 50_000, pollIntervalMs: 100 });
      const daemon = new StubDeskDaemon(config);

      expect(daemon.isRunning()).toBe(false);
      await daemon.start();
      expect(daemon.isRunning()).toBe(true);

      const status = daemon.getStatus();
      expect(status.status).toBe('RUNNING');
      expect(status.capitalUsd).toBe(50_000);
      expect(status.circuitBreakerTier).toBe('NORMAL');
      expect(status.engines).toBeDefined();

      const engines = status.engines as Record<string, { status: string }>;
      expect(engines.arbitrage.status).toBe('ACTIVE');
      expect(engines.marl.status).toBe('ACTIVE');
      expect(engines.amm.status).toBe('ACTIVE');
      expect(engines.alphaLab.status).toBe('ACTIVE');

      await daemon.stop();
      expect(daemon.isRunning()).toBe(false);
      expect(daemon.getStatus().status).toBe('STOPPED');
    });
  });

  describe('runDeskAuto Execution & Guardrails', () => {
    it('executes in PAPER mode by default without prompt', async () => {
      const result = await runDeskAuto({});
      expect(result.config.mode).toBe('PAPER');
      expect(result.daemon.isRunning()).toBe(true);
      expect(result.status.status).toBe('RUNNING');
      await result.daemon.stop();
    });

    it('blocks unconfirmed LIVE execution when dryRun is false', async () => {
      await expect(
        runDeskAuto(
          { mode: 'LIVE', dryRun: false },
          { promptConfirm: async () => false },
        ),
      ).rejects.toThrow('Live trading confirmation declined');
    });

    it('proceeds with LIVE execution when confirmation is granted', async () => {
      const result = await runDeskAuto(
        { mode: 'LIVE', dryRun: false },
        { promptConfirm: async () => true },
      );
      expect(result.config.mode).toBe('LIVE');
      expect(result.config.dryRun).toBe(false);
      expect(result.daemon.isRunning()).toBe(true);
      await result.daemon.stop();
    });

    it('supports custom daemon injection for deterministic testing', async () => {
      let started = false;
      let stopped = false;
      const customDaemon: IDeskDaemon = {
        config: parseDeskAutoConfig({}),
        start: async () => { started = true; },
        stop: async () => { stopped = true; },
        isRunning: () => started && !stopped,
        getStatus: () => ({ status: 'INJECTED' }),
      };

      const result = await runDeskAuto({}, { daemon: customDaemon });
      expect(started).toBe(true);
      expect(result.status.status).toBe('INJECTED');
      await result.daemon.stop();
      expect(stopped).toBe(true);
    });

    it('runs timed execution loop when durationSeconds is provided', async () => {
      vi.useFakeTimers();
      const runPromise = runDeskAuto({ durationSeconds: 2 });
      await vi.advanceTimersByTimeAsync(2000);
      const result = await runPromise;

      expect(result.config.durationSeconds).toBe(2);
      expect(result.daemon.isRunning()).toBe(false);
      vi.useRealTimers();
    });
  });

  describe('Commander Registration in src/index.ts', () => {
    it('registers desk:auto with all flags, descriptions, and defaults', async () => {
      const { buildCliProgram } = await import('../../../src/index');
      const program = buildCliProgram();
      const cmd = program.commands.find((c) => c.name() === 'desk:auto');
      expect(cmd).toBeDefined();

      const optionNames = cmd?.options.map((o) => o.attributeName());
      expect(optionNames).toContain('mode');
      expect(optionNames).toContain('capital');
      expect(optionNames).toContain('dryRun');
      expect(optionNames).toContain('exchanges');
      expect(optionNames).toContain('symbols');
      expect(optionNames).toContain('pollInterval');
      expect(optionNames).toContain('metricsPort');
      expect(optionNames).toContain('duration');

      const modeOpt = cmd?.options.find((o) => o.attributeName() === 'mode');
      expect(modeOpt?.defaultValue).toBe('PAPER');
      const capitalOpt = cmd?.options.find((o) => o.attributeName() === 'capital');
      expect(capitalOpt?.defaultValue).toBe('100000');
    });
  });
});
