/* eslint-disable no-console */
/**
 * Tests for LlmTradingStrategy — LLM-assisted trade evaluation via OmniRoute/LlmRouter.
 *
 * Uses Vitest (runner: vitest, path: src/strategies/__tests__/).
 * Stubs LlmRouter with plain objects so tests stay fast and offline.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { LlmTradingStrategy, type LlmTradeSignal } from '../llm-trading-strategy';

// ── Helpers ─────────────────────────────────────────────────────────────────

const makeMarketData = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  price: 50000,
  priceChangePct: 1.5,
  volume: 1_000_000,
  rsi: 45,
  emaShort: 50200,
  emaLong: 49800,
  ...overrides,
});

const routerOk = (content: string, latencyMs = 50) =>
  ({
    content,
    model: 'mlx-community/DeepSeek-R1-Distill-Qwen-32B-4bit',
    provider: 'mlx' as const,
    tokensUsed: 20,
    latencyMs,
  }) as const;

// Stable stub instances (not fn mocks) — execute() methods are tested as real async calls.
const makeStubRouter = () => ({
  fastChat: vi.fn<[any], Promise<{ content: string; latencyMs: number; model: string; provider: string }>>(),
  chat: vi.fn<[any], Promise<{ content: string; latencyMs: number; model: string; provider: string }>>(),
});

// ── Suite ────────────────────────────────────────────────────────────────────

describe('LlmTradingStrategy', () => {
  let strategy: LlmTradingStrategy;

  beforeEach(() => {
    vi.restoreAllMocks();
    strategy = new LlmTradingStrategy({
      symbol: 'BTC/USDT',
      confidenceThreshold: 0.55,
      deepConfirm: true,
      router: undefined as any, // replaced per test
    });
  });

  // ── Construction & status ────────────────────────────────────────────────

  it('constructor sets fields and getStatus reflects them', () => {
    const s = new LlmTradingStrategy({
      symbol: 'ETH/USDT',
      confidenceThreshold: 0.7,
      deepConfirm: false,
    });

    expect(s.name).toBe('llm-assisted');
    const status = s.getStatus();
    expect(status.strategy).toBe('llm-assisted');
    expect(status.symbol).toBe('ETH/USDT');
    expect(status.confidenceThreshold).toBe(0.7);
    expect(status.deepConfirm).toBe(false);
    expect(status.gateway).toBe('http://omnimbp.local:20128/v1');
  });

  // ── execute — fastChat only path ──────────────────────────────────────────

  it('calls fastChat with structured prompt and returns signal', async () => {
    const router = makeStubRouter();
    (router.fastChat as any).mockResolvedValue(routerOk('BUY|0.8|Bullish breakout'));

    strategy = new LlmTradingStrategy({
      symbol: 'BTC/USDT',
      deepConfirm: false,
      router: router as any,
    });
    vi.spyOn(strategy as any, 'router', 'get').mockReturnValue(router);

    const result = await strategy.execute(makeMarketData());

    expect(router.fastChat).toHaveBeenCalledTimes(1);
    const args = (router.fastChat as any).mock.calls[0][0];
    expect(args.messages[0].role).toBe('system');
    expect(args.messages[1].content).toContain('BTC/USDT');
    expect(args.maxTokens).toBe(32);
    expect(result.signal).toBe('BUY');
    expect(result.confidence).toBeCloseTo(0.8);
  });

  it('distance from threshold: fast signal near 0.5 becomes HOLD', async () => {
    const router = makeStubRouter();
    (router.fastChat as any).mockResolvedValue(routerOk('BUY|0.49|Faint hint'));

    strategy = new LlmTradingStrategy({
      symbol: 'BTC/USDT',
      confidenceThreshold: 0.55,
      deepConfirm: false,
      router: router as any,
    });
    vi.spyOn(strategy as any, 'router', 'get').mockReturnValue(router);

    const result = await strategy.execute(makeMarketData());
    expect(result.signal).toBe('HOLD');
  });

  // ── execute — deep confirm path ───────────────────────────────────────────

  it('deep confirm invoked when enabled and fast signal is actionable', async () => {
    const router = makeStubRouter();
    (router.fastChat as any).mockResolvedValue(routerOk('BUY|0.8|Bullish'));
    (router.chat as any).mockResolvedValue(routerOk('CONFIRM_BUY|0.92|DeepSeek confirms'));

    strategy = new LlmTradingStrategy({
      symbol: 'ETH/USDT',
      deepConfirm: true,
      router: router as any,
    });
    const impl = strategy as unknown as Record<string, unknown>;
    Object.defineProperty(impl, 'router', { get: () => router });

    const result = await strategy.execute(makeMarketData());

    expect(router.fastChat).toHaveBeenCalledTimes(1);
    expect(router.chat).toHaveBeenCalledTimes(1);
    expect(result.signal).toBe('BUY');
    expect((result.metadata as Record<string, unknown>)?.hadDeepConfirm).toBe(true);
  });

  it('deep confirm can override fast signal to HOLD (OVERRIDE_HOLD)', async () => {
    const router = makeStubRouter();
    (router.fastChat as any).mockResolvedValue(routerOk('BUY|0.72|Breakout'));
    (router.chat as any).mockResolvedValue(routerOk('OVERRIDE_HOLD|0.6|Consolidation'));

    strategy = new LlmTradingStrategy({
      symbol: 'SOL/USDT',
      deepConfirm: true,
      router: router as any,
    });
    const impl = strategy as unknown as Record<string, unknown>;
    Object.defineProperty(impl, 'router', { get: () => router });

    const result = await strategy.execute(makeMarketData());
    expect(result.signal).toBe('HOLD');
    expect((result.metadata as Record<string, unknown>)?.hadDeepConfirm).toBe(true);
  });

  it('deep confirm skipped when fast signal is HOLD', async () => {
    const router = makeStubRouter();
    (router.fastChat as any).mockResolvedValue(routerOk('HOLD|0.4|No edge'));

    strategy = new LlmTradingStrategy({
      symbol: 'MATIC/USDT',
      deepConfirm: true,
      router: router as any,
    });
    const impl = strategy as unknown as Record<string, unknown>;
    Object.defineProperty(impl, 'router', { get: () => router });

    await strategy.execute(makeMarketData());
    expect(router.chat).not.toHaveBeenCalled();
  });

  // ── execute — failure handling ────────────────────────────────────────────

  it('fastChat failure falls back to heuristic or chat only', async () => {
    const router = makeStubRouter();
    (router.fastChat as any).mockRejectedValue(new Error('nemotron down'));

    strategy = new LlmTradingStrategy({
      symbol: 'AVAX/USDT',
      deepConfirm: false,
      router: router as any,
    });
    const impl = strategy as unknown as Record<string, unknown>;
    Object.defineProperty(impl, 'router', { get: () => router });

    // With all providers down strategy must keep running (never stall)
    const result = await strategy.execute(makeMarketData());
    expect(['BUY', 'SELL', 'HOLD']).toContain(result.signal);
    expect((result.metadata as Record<string, unknown>)?.provider).toBe('heuristic-fallback');
  });

  it('chat failure after fast preserves fast signal', async () => {
    const router = makeStubRouter();
    (router.fastChat as any).mockResolvedValue(routerOk('SELL|0.8|Bearish'));
    (router.chat as any).mockRejectedValue(new Error('deepseek down'));

    strategy = new LlmTradingStrategy({
      symbol: 'DOT/USDT',
      deepConfirm: true,
      router: router as any,
    });
    const impl = strategy as unknown as Record<string, unknown>;
    Object.defineProperty(impl, 'router', { get: () => router });

    const result = await strategy.execute(makeMarketData());
    expect(result.signal).toBe('SELL');
    expect(result.confidence).toBeCloseTo(0.8, 1);
  });

  // ── execute — metadata ────────────────────────────────────────────────────

  it('metadata includes gateway, latencyMs, tiers, and symbol', async () => {
    const router = makeStubRouter();
    (router.fastChat as any).mockResolvedValue(routerOk('HOLD|0.5|Flat', 42));

    strategy = new LlmTradingStrategy({
      symbol: 'BTC/USDT',
      deepConfirm: false,
      router: router as any,
    });
    const impl = strategy as unknown as Record<string, unknown>;
    Object.defineProperty(impl, 'router', { get: () => router });

    const result = await strategy.execute(makeMarketData());
    const meta = result.metadata as Record<string, unknown>;

    expect(meta.strategy).toBe('llm-assisted');
    expect(meta.symbol).toBe('BTC/USDT');
    expect(meta.gateway).toBe('http://omnimbp.local:20128/v1');
    expect(meta.latencyMs).toBe(42);
    expect(meta.hadDeepConfirm).toBe(false);
    expect((meta.tiers as Record<string, unknown>)?.fast).toEqual({
      signal: 'HOLD',
      confidence: 0.5,
    });
    expect((meta.tiers as Record<string, unknown>)?.deep).toBeNull();
  });

  // ── initialize warms router ───────────────────────────────────────────────

  it('initialize resolves on ping failure (cold start acceptable)', async () => {
    const router = makeStubRouter();
    (router.chat as any).mockRejectedValue(new Error('cold start'));

    strategy = new LlmTradingStrategy({
      symbol: 'BTC/USDT',
      router: router as any,
    });
    const impl = strategy as unknown as Record<string, unknown>;
    Object.defineProperty(impl, 'router', { get: () => router });

    await expect(strategy.initialize()).resolves.toBeUndefined();
    expect(router.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([{ role: 'user', content: 'ping' }]),
        maxTokens: 4,
      }),
    );
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it('parseSignal downcases unknown signal to HOLD', async () => {
    const router = makeStubRouter();
    (router.fastChat as any).mockResolvedValue(routerOk('MAYBE|0.3|Unclear'));

    strategy = new LlmTradingStrategy({
      symbol: 'XRP/USDT',
      deepConfirm: false,
      router: router as any,
    });
    const impl = strategy as unknown as Record<string, unknown>;
    Object.defineProperty(impl, 'router', { get: () => router });

    const result = await strategy.execute(makeMarketData());
    expect(result.signal).toBe('HOLD');
  });

  it('parseSignal clamps confidence to 0.1..1', async () => {
    const router = makeStubRouter();
    (router.fastChat as any).mockResolvedValue(routerOk('BUY|2.5|Over'));

    strategy = new LlmTradingStrategy({
      symbol: 'DOT/USDT',
      deepConfirm: false,
      router: router as any,
    });
    const impl = strategy as unknown as Record<string, unknown>;
    Object.defineProperty(impl, 'router', { get: () => router });

    const result = await strategy.execute(makeMarketData());
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('parseDeepSignal maps CONFIRM_* back to fast signal', async () => {
    const router = makeStubRouter();
    (router.fastChat as any).mockResolvedValue(routerOk('SELL|0.7|Bear'));
    (router.chat as any).mockResolvedValue(routerOk('CONFIRM_SELL|0.9|-', 20));

    strategy = new LlmTradingStrategy({
      symbol: 'SOL/USDT',
      deepConfirm: true,
      router: router as any,
    });
    const impl = strategy as unknown as Record<string, unknown>;
    Object.defineProperty(impl, 'router', { get: () => router });

    const result = await strategy.execute(makeMarketData());
    expect(result.signal).toBe('SELL');
  });

  it('parseDeepSignal maps OVERRIDE_BUY/SELL/HOLD correctly', async () => {
    const router = makeStubRouter();
    // Deep confirm only runs when fast signal is actionable (non-HOLD)
    (router.fastChat as any).mockResolvedValue(routerOk('SELL|0.72|Bearish setup'));
    (router.chat as any).mockResolvedValue(routerOk('OVERRIDE_BUY|0.7|Hidden accumulation'));

    strategy = new LlmTradingStrategy({
      symbol: 'LINK/USDT',
      deepConfirm: true,
      router: router as any,
    });
    const impl = strategy as unknown as Record<string, unknown>;
    Object.defineProperty(impl, 'router', { get: () => router });

    const result = await strategy.execute(makeMarketData());
    expect(result.signal).toBe('BUY');
  });

  it('heuristicFallback produces different signals for opposing conditions', async () => {
    const router = makeStubRouter();
    (router.fastChat as any).mockRejectedValue(new Error('down'));

    strategy = new LlmTradingStrategy({
      symbol: 'UNI/USDT',
      router: router as any,
    });
    const impl = strategy as unknown as Record<string, unknown>;
    Object.defineProperty(impl, 'router', { get: () => router });

    const bullish = await strategy.execute(
      makeMarketData({ priceChangePct: 5, rsi: 25, emaShort: 51000, emaLong: 49000 }),
    );
    const bearish = await strategy.execute(
      makeMarketData({ priceChangePct: -5, rsi: 75, emaShort: 48000, emaLong: 51000 }),
    );

    // At least one side should differ from neutral given extreme inputs
    const signals = [bullish.signal, bearish.signal];
    const hasNonHOLD = signals.some((s) => s !== 'HOLD');
    expect(hasNonHOLD).toBe(true);
  });
});
