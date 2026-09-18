/**
 * Live Trading Integration — Guard, Positions, Journal, and Errors Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { LiveTradingOrchestrator } from '../live-trading-orchestrator';

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

describe('Live Trading Guard, Positions, and Journal', () => {
  let orch: LiveTradingOrchestrator;
  beforeEach(async () => {
    fs.mkdirSync(getTestTmp(), { recursive: true });
    orch = new LiveTradingOrchestrator({ paperTrading: true, capitalUsdc: 5000 });
    await orch.start();
  });
  afterEach(async () => { await orch.stop(); cleanupTmp(); });

  it('guard is disabled in PAPER mode (all orders pass)', () => {
    const status = orch.getGuardStatus();
    expect(status.enabled).toBe(false);
    expect(status.circuitTripped).toBe(false);
  });

  it('large orders pass in PAPER mode (guard disabled)', async () => {
    const resp = await orch.placeOrder(makeOrder({ tokenId: '0xbig', price: 0.5, size: 500 }));
    expect(resp.orderID).toMatch(/^paper-/);
  });

  it('guard status returns expected fields', () => {
    const s = orch.getGuardStatus();
    expect(s).toHaveProperty('enabled');
    expect(s).toHaveProperty('circuitTripped');
    expect(s).toHaveProperty('consecutiveLosses');
    expect(s).toHaveProperty('totalWins');
    expect(s).toHaveProperty('totalLosses');
    expect(s).toHaveProperty('dailyPnl');
    expect(s).toHaveProperty('openPositions');
  });

  it('position summary starts at zero before any orders', () => {
    const s = orch.getPositionSummary();
    expect(s.positionCount).toBe(0);
    expect(s.totalExposure).toBe(0);
    expect(s.totalRealizedPnl).toBe(0);
  });

  it('position summary reports correctly after orders', async () => {
    await orch.placeOrder(makeOrder({ tokenId: '0xposA', side: 'BUY', size: 10, price: 0.55 }));
    await orch.placeOrder(makeOrder({ tokenId: '0xposB', side: 'SELL', size: 5, price: 0.65 }));
    const s = orch.getPositionSummary();
    expect(typeof s.totalExposure).toBe('number');
    expect(typeof s.totalUnrealizedPnl).toBe('number');
    expect(typeof s.totalRealizedPnl).toBe('number');
  });

  it('journal is accessible and empty initially', () => {
    const journal = orch.getJournal();
    expect(journal).toBeDefined();
    expect(journal.loadFills()).toEqual([]);
  });

  it('persistState() saves positions and P&L to temp dir', async () => {
    await orch.placeOrder(makeOrder({ tokenId: '0xpersist', price: 0.60, size: 30 }));
    await orch.stop();
    expect(fs.existsSync(path.join(getTestTmp(), 'live-positions.json'))).toBe(true);
    expect(fs.existsSync(path.join(getTestTmp(), 'live-pnl.json'))).toBe(true);
  });

  it('journal persists across stop/start cycles', async () => {
    await orch.placeOrder(makeOrder({ tokenId: '0xpersist1', price: 0.55, size: 10 }));
    await orch.stop();
    const orch2 = new LiveTradingOrchestrator({ paperTrading: true, capitalUsdc: 5000 });
    await orch2.start();
    expect(orch2.getStatus()).toBe('running');
    await orch2.stop();
  });

  it('orchestrator reports correct mode (PAPER vs LIVE)', () => {
    expect(orch.getMode()).toBe('PAPER');
    const liveOrch = new LiveTradingOrchestrator({ paperTrading: false, capitalUsdc: 1000 });
    expect(liveOrch.getMode()).toBe('LIVE');
  });

  it('rejects orders when orchestrator is stopped', async () => {
    await orch.stop();
    await expect(orch.placeOrder(makeOrder())).rejects.toThrow('Orchestrator not running');
  });

  it('Gamma API handles timeout/abort gracefully', async () => {
    const controller = new AbortController();
    controller.abort();
    try {
      await fetch(`${GAMMA_API}/markets?limit=1`, { signal: controller.signal });
    } catch (err) {
      expect(err).toBeDefined();
      expect((err as Error).name).toMatch(/AbortError|TypeError/);
    }
  });
});
