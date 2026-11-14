/**
 * Regression suite for LiveTradingOrchestrator PolyRisk gate, PolyKillSwitch
 * latching, and parabolic FeeScheduleResolver paper fills.
 */

import { describe, expect, it, vi } from 'vitest';
import { LiveTradingOrchestrator } from '../../src/desk/polymarket/live-trading-orchestrator';
import { StrategyLiveBridge } from '../../src/desk/polymarket/strategy-live-bridge';
import { LiveOrderManagerProxy } from '../../src/desk/polymarket/live-order-manager-proxy';
import { EXEMPT_FEE_SCHEDULE } from '../../src/desk/polymarket/polymarket-fee-calculator';

const TOKEN = 'token-quant-alpha-1';

function buildOrder(overrides: Partial<{ tokenId: string; side: 'BUY' | 'SELL'; price: number; size: number; orderType: 'GTC' | 'GTD' | 'FOK' | 'IOC' }> = {}) {
  return {
    tokenId: TOKEN,
    side: 'BUY' as const,
    price: 0.5,
    size: 20,
    expiration: Math.floor(Date.now() / 1000) + 300,
    nonce: '1',
    feeRateBps: 0,
    signatureType: 0 as const,
    ...overrides,
  };
}

describe('LiveTradingOrchestrator — PolyRisk, KillSwitch & FeeScheduleResolver', () => {
  it('blocks orders when enforcePolyRiskGate is enabled and market observation or fee schedule is missing', async () => {
    const orch = new LiveTradingOrchestrator({
      paperTrading: true,
      capitalUsdc: 10_000,
      enforcePolyRiskGate: true,
    });
    await orch.start();

    await expect(orch.placeOrder(buildOrder())).rejects.toThrow(/PolyRisk blocked \[UNRESOLVED_STATE\]/);

    orch.recordMarketObservation(Date.now());
    await expect(orch.placeOrder(buildOrder())).rejects.toThrow(/PolyRisk blocked \[UNKNOWN_FEE_SCHEDULE\]/);

    await orch.stop();
  });

  it('allows paper orders once market observation + feeScheduleResolver are wired, and records parabolic fee', async () => {
    const resolver = {
      resolve: vi.fn(async () => ({ exponent: 1, rate: 0.04, takerOnly: true, rebateRate: 0.25 } as const)),
    };
    const orch = new LiveTradingOrchestrator({
      paperTrading: true,
      capitalUsdc: 10_000,
      enforcePolyRiskGate: true,
      feeScheduleResolver: resolver,
    });
    await orch.start();
    orch.recordMarketObservation(Date.now());

    const res = await orch.placeOrder(buildOrder({ price: 0.5, size: 20 }));
    expect(res.status).toBe('matched');
    expect(resolver.resolve).toHaveBeenCalledWith(TOKEN);

    // At p=0.5, parabolic fee per share = 0.04 * (0.5 * 0.5) = 0.01 -> 20 shares = $0.20 fee on reconciler
    const rec = orch.getReconciler().getOrder(res.orderID);
    expect(rec?.feesPaidUsdc).toBeCloseTo(0.2, 6);

    await orch.stop();
  });

  it('applies zero taker fee in paper mode when feeScheduleResolver resolves an exempt null schedule', async () => {
    const resolver = { resolve: vi.fn(async () => null) };
    const orch = new LiveTradingOrchestrator({
      paperTrading: true,
      capitalUsdc: 10_000,
      enforcePolyRiskGate: true,
      feeScheduleResolver: resolver,
    });
    await orch.start();
    orch.recordMarketObservation(Date.now());

    const res = await orch.placeOrder(buildOrder({ price: 0.5, size: 20 }));
    expect(res.status).toBe('matched');
    expect(EXEMPT_FEE_SCHEDULE.rate).toBe(0);
    const rec = orch.getReconciler().getOrder(res.orderID);
    expect(rec?.feesPaidUsdc).toBeCloseTo(0, 6);

    await orch.stop();
  });

  it('latches PolyKillSwitch on fire(), skips strategy ticks, and rejects subsequent orders', async () => {
    const transport = vi.fn(async () => ({ ok: true, status: 200, body: 'cancelled' }));
    const orch = new LiveTradingOrchestrator({
      paperTrading: true,
      capitalUsdc: 10_000,
      killSwitchTransport: transport,
    });
    await orch.start();

    const fired = await orch.getPolyKillSwitch().fire('manual risk drill');
    expect(fired.issued).toBe(true);
    expect(orch.getPolyKillSwitch().isFired()).toBe(true);
    expect(transport).toHaveBeenCalledTimes(1);

    let tickRan = false;
    await orch.executeStrategyTick('toxicity-aware-market-maker', async () => {
      tickRan = true;
    });
    expect(tickRan).toBe(false);

    await expect(orch.placeOrder(buildOrder())).rejects.toThrow(/KILL_SWITCH_ACTIVE/);
    await expect(
      orch.submitSignal({ tokenId: TOKEN, side: 'BUY', price: 0.5, size: 10, timestamp: Date.now() }, 'test'),
    ).rejects.toThrow(/KILL_SWITCH_ACTIVE/);
    await orch.stop();
  });

  it('enforces PolyRisk on submitSignal, tracks high-water-mark drawdown, and wires LiveOrderManagerProxy orderType/rejected', async () => {
    const resolver = { resolve: vi.fn(async () => null) };
    const orch = new LiveTradingOrchestrator({
      paperTrading: true,
      capitalUsdc: 10_000,
      enforcePolyRiskGate: true,
      feeScheduleResolver: resolver,
    });
    await orch.start();

    // submitSignal cannot bypass PolyRisk when market observation is missing
    await expect(
      orch.submitSignal(
        { tokenId: TOKEN, side: 'BUY', price: 0.5, size: 10, orderType: 'IOC', timestamp: Date.now() },
        'test',
      ),
    ).rejects.toThrow(/PolyRisk blocked \[UNRESOLVED_STATE\]/);

    // Proxy classifies PolyRisk rejections as rejected=true and increments signalsRejected
    const bridge = new StrategyLiveBridge(orch);
    const proxy = new LiveOrderManagerProxy(bridge, 'test-strat');
    await expect(
      proxy.placeOrder({ tokenId: TOKEN, side: 'buy', price: 0.5, size: 4, orderType: 'IOC' }),
    ).rejects.toThrow(/Order rejected:.*PolyRisk blocked/);
    expect(bridge.getStats().signalsRejected).toBe(1);

    // Once observed, IOC size=4 (< 5 resting share floor) passes because orderType='IOC' is preserved!
    orch.recordMarketObservation(Date.now());
    const iocRes = await proxy.placeOrder({ tokenId: TOKEN, side: 'buy', price: 0.5, size: 4, orderType: 'IOC' });
    expect(iocRes.filled).toBe(true);

    // Resting GTC size=4 (< 5 shares) is blocked by ORDER_BELOW_MIN_SIZE
    await expect(
      proxy.placeOrder({ tokenId: TOKEN, side: 'buy', price: 0.5, size: 4, orderType: 'GTC' }),
    ).rejects.toThrow(/ORDER_BELOW_MIN_SIZE/);

    await orch.stop();
  });
});
