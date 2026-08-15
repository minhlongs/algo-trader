/**
 * Integration Tests for Trading Pipeline
 *
 * Tests the wired pipeline factory (createTradingPipeline) and
 * recordTradeOutcome flow: drawdown gating → wallet mutation → audit.
 * All mocks are vi.fn(); no network, Redis, or filesystem.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WalletTrade } from '../../src/desk/wallet/wallet-manager';
import type { TieredDrawdownState } from '../../src/desk/risk/tiered-drawdown-breaker';

/* ── Mocks ─────────────────────────────────────────────────────────── */

vi.mock('../../src/desk/utils/logger', () => ({
  logger: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockUpdate = vi.fn();
vi.mock('../../src/desk/risk/tiered-drawdown-breaker', () => ({
  TieredDrawdownBreaker: vi.fn().mockImplementation(function () {
    return { update: mockUpdate };
  }),
}));

vi.mock('../../src/desk/risk/kelly-position-sizer', () => ({
  KellyPositionSizer: vi.fn().mockImplementation(function () {
    return { size: vi.fn() };
  }),
}));

vi.mock('../../src/desk/execution/twap-executor', () => ({
  TwapExecutor: vi.fn().mockImplementation(function () {
    return { getConfig: vi.fn().mockReturnValue({ minChunkUsd: 500 }) };
  }),
}));

vi.mock('../../src/desk/audit/immutable-trade-audit', () => ({
  ImmutableTradeAudit: vi.fn().mockImplementation(function () {
    return {
      logTrade:          vi.fn(),
      logCircuitBreaker: vi.fn(),
      getAuditTrail:     vi.fn().mockReturnValue([]),
      verifyIntegrity:   vi.fn().mockReturnValue(true),
    };
  }),
}));

const mockRecordTrade = vi.fn();
const mockGetWalletSummary = vi.fn().mockReturnValue({
  totalWallets: 1,
  totalCapital: 10000,
  totalPnl: 0,
  ownCapital: { balance: 10000, pnl: 0 },
  managedWallets: [],
});
vi.mock('../../src/desk/wallet/wallet-manager', () => ({
  WalletManager: vi.fn().mockImplementation(function () {
    return {
      recordTrade:      mockRecordTrade,
      getWalletSummary: mockGetWalletSummary,
    };
  }),
}));

const mockEmitTradeAuditEvent = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/platform/audit/audit-hooks', () => ({
  emitTradeAuditEvent: (...args: unknown[]) => mockEmitTradeAuditEvent(...args),
}));

/* ── Imports (after mocks) ─────────────────────────────────────────── */

import { createTradingPipeline } from '../../src/desk/trading-pipeline';

/* ── Helpers ───────────────────────────────────────────────────────── */

function makeTrade(overrides?: Partial<WalletTrade>): WalletTrade {
  return {
    walletLabel: 'own-capital',
    marketId:    'polymarket-us-election',
    side:        'buy',
    sizeUsd:     250,
    price:       0.65,
    pnl:         12.5,
    timestamp:   Date.now(),
    ...overrides,
  };
}

function drawdownState(overrides?: Partial<TieredDrawdownState>): TieredDrawdownState {
  return {
    highWaterMark:     10000,
    currentValue:      9900,
    drawdownPercent:   1,
    tier:              'NORMAL',
    sizingMultiplier:  1,
    haltedUntil:       null,
    dailyPausedUntil:  null,
    dailyStartValue:   10000,
    dailyPnl:          0,
    events:            [],
    ...overrides,
  };
}

const PIPELINE_CONFIG = {
  initialPortfolioValue: 10_000,
  walletLabel:           'own-capital' as const,
};

/* ── Tests ─────────────────────────────────────────────────────────── */

describe('TradingPipeline – recordTradeOutcome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockReturnValue(drawdownState());
  });

  /* a. happy path */
  it('records trade and updates wallet when drawdown is safe', async () => {
    mockUpdate.mockReturnValue(drawdownState({ tier: 'NORMAL', drawdownPercent: 1 }));

    const pipeline = createTradingPipeline(PIPELINE_CONFIG);
    const trade    = makeTrade();

    await pipeline.recordTradeOutcome(trade, 9900);

    expect(mockUpdate).toHaveBeenCalledWith(9900);
    expect(mockRecordTrade).toHaveBeenCalledWith(trade, 'own-capital');
  });

  /* b. HALT blocks */
  it('blocks trade at HALT tier without mutating wallet', async () => {
    mockUpdate.mockReturnValue(drawdownState({ tier: 'HALT', drawdownPercent: -16 }));

    const pipeline = createTradingPipeline(PIPELINE_CONFIG);

    await pipeline.recordTradeOutcome(makeTrade(), 8400);

    expect(mockRecordTrade).not.toHaveBeenCalled();
  });

  /* c. HARD_STOP blocks */
  it('blocks trade at HARD_STOP tier without mutating wallet', async () => {
    mockUpdate.mockReturnValue(drawdownState({ tier: 'HARD_STOP', drawdownPercent: -22 }));

    const pipeline = createTradingPipeline(PIPELINE_CONFIG);

    await pipeline.recordTradeOutcome(makeTrade(), 7800);

    expect(mockRecordTrade).not.toHaveBeenCalled();
  });

  /* d. TWAP threshold exposed */
  it('exposes default TWAP threshold of $500', () => {
    const pipeline = createTradingPipeline(PIPELINE_CONFIG);

    expect(pipeline.twapThresholdUsd).toBe(500);
    expect(pipeline.twap).toBeDefined();
  });

  /* e. TWAP threshold configurable */
  it('accepts custom TWAP threshold', () => {
    const pipeline = createTradingPipeline({
      ...PIPELINE_CONFIG,
      twapThresholdUsd: 1000,
    });

    expect(pipeline.twapThresholdUsd).toBe(1000);
  });

  /* f. correct sequence: drawdown checked before wallet write */
  it('checks drawdown before wallet write (correct sequencing)', async () => {
    const callOrder: string[] = [];
    mockUpdate.mockImplementation((..._args: unknown[]) => {
      callOrder.push('drawdown');
      return drawdownState({ tier: 'NORMAL' });
    });
    mockRecordTrade.mockImplementation(async () => {
      callOrder.push('wallet');
    });

    const pipeline = createTradingPipeline(PIPELINE_CONFIG);

    await pipeline.recordTradeOutcome(makeTrade(), 9900);

    expect(callOrder).toEqual(['drawdown', 'wallet']);
  });

  /* g. rejection audit event recorded */
  it('emits trade_rejected audit event when drawdown blocks trade', async () => {
    mockUpdate.mockReturnValue(drawdownState({ tier: 'HALT', drawdownPercent: -16 }));

    const pipeline = createTradingPipeline(PIPELINE_CONFIG);

    await pipeline.recordTradeOutcome(makeTrade(), 8400);

    expect(mockEmitTradeAuditEvent).toHaveBeenCalledTimes(1);
    const [event] = mockEmitTradeAuditEvent.mock.calls[0];
    expect(event.eventType).toBe('trade_rejected');
    expect(event.metadata.drawdownTier).toBe('HALT');
  });

  /* h. WalletManager error propagates */
  it('propagates WalletManager error to caller', async () => {
    mockUpdate.mockReturnValue(drawdownState({ tier: 'NORMAL' }));
    mockRecordTrade.mockRejectedValueOnce(new Error('Insufficient balance'));

    const pipeline = createTradingPipeline(PIPELINE_CONFIG);

    await expect(
      pipeline.recordTradeOutcome(makeTrade(), 9900),
    ).rejects.toThrow('Insufficient balance');
  });

  /* i. shared instances reused */
  it('reuses shared wallet and audit instances across pipelines', () => {
    const sharedWallet = { recordTrade: mockRecordTrade, getWalletSummary: mockGetWalletSummary };
    const sharedAudit  = { logTrade: vi.fn(), getAuditTrail: vi.fn() };

    const p1 = createTradingPipeline(PIPELINE_CONFIG, sharedWallet as never, sharedAudit as never);
    const p2 = createTradingPipeline(PIPELINE_CONFIG, sharedWallet as never, sharedAudit as never);

    expect(p1.wallet).toBe(sharedWallet);
    expect(p2.wallet).toBe(sharedWallet);
    expect(p1.audit).toBe(sharedAudit);
    expect(p2.audit).toBe(sharedAudit);
  });
});
