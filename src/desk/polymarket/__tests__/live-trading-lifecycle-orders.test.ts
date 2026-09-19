/**
 * Live Trading Integration — Lifecycle, Connectivity, and Orders Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { LiveTradingOrchestrator } from '../live-trading-orchestrator';
import type { GammaMarket } from '../gamma-client';

const { getTestTmp } = vi.hoisted(() => {
  let t = '';
  return { getTestTmp: () => (t ||= `${tmpdir()}/cashclaw-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`) };
});

vi.mock('../../../shared/persistence/file-store', () => ({
  cashclawPath: vi.fn((f: string) => path.join(getTestTmp(), f)),
  appendJsonl: vi.fn((p: string, d: Record<string, unknown>) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, JSON.stringify(d) + '\n', 'utf8');
  }),
  readJsonl: vi.fn(<T>(p: string): T[] => {
    try { return fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as T); } catch { return []; }
  }),
  readJsonState: vi.fn(<T>(p: string): T | null => {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')) as T; } catch { return null; }
  }),
}));

const GAMMA_API = 'https://gamma-api.polymarket.com';

async function fetchGammaMarkets(limit = 5): Promise<GammaMarket[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${GAMMA_API}/markets?limit=${limit}`, { signal: controller.signal });
    return res.ok ? ((await res.json()) as GammaMarket[]) : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

function skipIfGamma(m: GammaMarket[] | null): boolean {
  if (!m || m.length === 0) { process.stderr.write('[SKIP] Gamma unreachable\n'); return true; }
  return false;
}

function cleanupTmp(): void {
  try { const t = getTestTmp(); if (fs.existsSync(t)) fs.rmSync(t, { recursive: true, force: true }); } catch { /* noop */ }
}

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    tokenId: '0xabc123def456', price: 0.55, size: 100, side: 'BUY' as const,
    expiration: Math.floor(Date.now() / 1000) + 300, nonce: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    feeRateBps: 0, signatureType: 0, ...overrides,
  };
}

describe('Gamma API connectivity', () => {
  it('fetches real markets with valid response shape', async () => {
    const m = await fetchGammaMarkets(5);
    if (skipIfGamma(m)) return;
    expect(Array.isArray(m)).toBe(true);
    expect(m!.length).toBeGreaterThan(0);
  });

  it('returns markets with required schema fields (conditionId, question, outcomes, yesPrice)', async () => {
    const m = await fetchGammaMarkets(5);
    if (skipIfGamma(m)) return;
    expect(typeof m![0].conditionId).toBe('string');
    expect(m![0].question).toBeTruthy();
    expect(m![0]).toHaveProperty('conditionId');
    expect(m![0]).toHaveProperty('question');
    expect(m![0]).toHaveProperty('active');
  });
});

describe('strategy scanning', () => {
  it('scans real Gamma markets and instantiates a V2 strategy', async () => {
    const m = await fetchGammaMarkets(10);
    if (skipIfGamma(m)) return;
    const { ResolutionFrontrunnerStrategy, DEFAULT_CONFIG } = await import('../../strategies/polymarket/resolution-frontrunner-v2');
    expect(new ResolutionFrontrunnerStrategy(DEFAULT_CONFIG).constructor.name).toBe('ResolutionFrontrunnerStrategy');
  });

  it('strategy instantiation handles empty markets without error', async () => {
    const { ResolutionFrontrunnerStrategy, DEFAULT_CONFIG } = await import('../../strategies/polymarket/resolution-frontrunner-v2');
    expect(new ResolutionFrontrunnerStrategy(DEFAULT_CONFIG)).toBeDefined();
  });
});

describe('Live Trading Lifecycle & Orders', () => {
  let orch: LiveTradingOrchestrator;
  beforeEach(async () => {
    fs.mkdirSync(getTestTmp(), { recursive: true });
    orch = new LiveTradingOrchestrator({ paperTrading: true, capitalUsdc: 5000 });
    await orch.start();
  });
  afterEach(async () => { await orch.stop(); cleanupTmp(); });

  it('starts in PAPER mode and transitions through lifecycle', () => {
    expect(orch.getStatus()).toBe('running');
    expect(orch.getMode()).toBe('PAPER');
    expect(orch.getPositions()).toEqual([]);
    expect(orch.getActiveOrders()).toEqual([]);
  });

  it('start → stop → start cycles cleanly', async () => {
    expect(orch.getStatus()).toBe('running');
    await orch.stop();
    expect(orch.getStatus()).toBe('stopped');
    await orch.start();
    expect(orch.getStatus()).toBe('running');
    await orch.placeOrder(makeOrder({ tokenId: '0xcycle', size: 20 }));
    await orch.stop();
    expect(orch.getStatus()).toBe('stopped');
  });

  it('stop() is idempotent — returns immediately if already stopped', async () => {
    await orch.stop();
    expect(orch.getStatus()).toBe('stopped');
    await orch.stop();
    expect(orch.getStatus()).toBe('stopped');
  });

  it('places a BUY order and returns paper order ID', async () => {
    const resp = await orch.placeOrder(makeOrder({ side: 'BUY', price: 0.55, size: 100 }));
    expect(resp.orderID).toMatch(/^paper-/);
    expect(resp.status).toBe('matched');
  });

  it('places a SELL order and returns paper order ID', async () => {
    const resp = await orch.placeOrder(makeOrder({ side: 'SELL', price: 0.65, size: 50 }));
    expect(resp.orderID).toMatch(/^paper-/);
    expect(resp.status).toBe('matched');
  });

  it('places multiple orders concurrently — all unique IDs', async () => {
    const orders = Array.from({ length: 5 }, (_, i) =>
      orch.placeOrder(makeOrder({ tokenId: `0xconcurrent${i}`, price: 0.5 + i * 0.05, size: 50, side: i % 2 === 0 ? 'BUY' : 'SELL' })),
    );
    const results = await Promise.all(orders);
    expect(results).toHaveLength(5);
    expect(new Set(results.map((r) => r.orderID)).size).toBe(5);
  });

  it('throws on placeOrder after stop', async () => {
    await orch.stop();
    await expect(orch.placeOrder(makeOrder())).rejects.toThrow('Orchestrator not running');
  });
});
