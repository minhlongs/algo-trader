/**
 * Live Trading Integration — Bridge and Adapter Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { LiveTradingOrchestrator } from '../live-trading-orchestrator';
import { StrategyLiveBridge } from '../strategy-live-bridge';
import { StrategyAdapter } from '../strategy-adapter';

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

function cleanupTmp(): void {
  try { const t = getTestTmp(); if (fs.existsSync(t)) fs.rmSync(t, { recursive: true, force: true }); } catch { /* noop */ }
}

describe('Live Trading Bridge & Adapter', () => {
  let orch: LiveTradingOrchestrator;

  beforeEach(async () => {
    fs.mkdirSync(getTestTmp(), { recursive: true });
    orch = new LiveTradingOrchestrator({ paperTrading: true, capitalUsdc: 5000 });
    await orch.start();
  });

  afterEach(async () => {
    await orch.stop();
    cleanupTmp();
  });

  it('bridge routes signals through orchestrator', async () => {
    const bridge = new StrategyLiveBridge(orch);
    const result = await bridge.onSignal({
      tokenId: '0xbridgetest',
      side: 'BUY',
      size: 20,
      price: 0.45,
      description: 'Bridge test signal',
      confidence: 0.8,
    });
    expect(result.rejected).toBe(false);
    expect(result.response?.orderID).toMatch(/^paper-/);
    expect(result.error).toBeNull();
  });

  it('adapter enters and exits a position through bridge', async () => {
    const bridge = new StrategyLiveBridge(orch);
    const adapter = new StrategyAdapter(bridge, 'test-strategy');

    const entry = await adapter.enterPosition({
      tokenId: '0xadaptertest',
      conditionId: '0xcond123',
      side: 'yes',
      price: 0.50,
      size: 40,
    });
    expect(entry.orderId).toMatch(/^paper-/);
    expect(entry.side).toBe('BUY');

    const exit = await adapter.exitPosition({
      tokenId: '0xadaptertest',
      conditionId: '0xcond123',
      price: 0.62,
      reason: 'take-profit',
    });
    expect(exit.orderId).toMatch(/^paper-/);
    expect(exit.side).toBe('SELL');

    const stats = adapter.getStats();
    expect(stats.entries).toBe(1);
    expect(stats.exits).toBe(1);
    expect(stats.totalFills).toBe(2);
    expect(adapter.getActiveFills().size).toBe(0);
  });

  it('adapter tracks multiple open positions', async () => {
    const bridge = new StrategyLiveBridge(orch);
    const adapter = new StrategyAdapter(bridge, 'multi-strat');

    await adapter.enterPosition({
      tokenId: '0xmulti1', conditionId: '0xcondA', side: 'yes', price: 0.40, size: 30,
    });
    await adapter.enterPosition({
      tokenId: '0xmulti2', conditionId: '0xcondB', side: 'no', price: 0.30, size: 25,
    });

    expect(adapter.getActiveFills().size).toBe(2);
  });

  it('bridge delivers accurate stats after signals', async () => {
    const bridge = new StrategyLiveBridge(orch);
    await bridge.onSignal({ tokenId: '0xstats1', side: 'BUY', size: 10, price: 0.5, confidence: 0.6 });
    await bridge.onSignal({ tokenId: '0xstats2', side: 'SELL', size: 10, price: 0.4, confidence: 0.5 });

    const stats = bridge.getStats();
    expect(stats.signalsProcessed).toBe(2);
    expect(stats.signalsRejected).toBe(0);
    expect(stats.scansCompleted).toBe(0);
    expect(stats.scannerActive).toBe(false);
  });
});
