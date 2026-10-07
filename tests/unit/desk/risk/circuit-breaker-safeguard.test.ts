import { describe, it, expect, vi } from 'vitest';
import { CircuitBreakerSafeguard } from '../../../../src/desk/risk/circuit-breaker-safeguard';

describe('CircuitBreakerSafeguard', () => {
  it('tracks NAV and remains NORMAL when drawdown is within safe boundaries', () => {
    const safeguard = new CircuitBreakerSafeguard({
      maxDrawdownPct: 0.10,
      warningDrawdownPct: 0.05,
    });

    const status1 = safeguard.updateNav(100000, 1000);
    expect(status1.state).toBe('NORMAL');
    expect(status1.peakNavUsd).toBe(100000);
    expect(status1.isTradingAllowed).toBe(true);

    const status2 = safeguard.updateNav(98000, 2000); // 2% drawdown
    expect(status2.state).toBe('NORMAL');
    expect(status2.currentDrawdownPct).toBeCloseTo(0.02, 4);
  });

  it('enters WARNING state when drawdown exceeds warning threshold', () => {
    const safeguard = new CircuitBreakerSafeguard({
      maxDrawdownPct: 0.10,
      warningDrawdownPct: 0.05,
    });
    const warnSpy = vi.fn();
    safeguard.on('warning', warnSpy);

    safeguard.updateNav(100000, 1000);
    const status = safeguard.updateNav(94000, 2000); // 6% drawdown

    expect(status.state).toBe('WARNING');
    expect(status.isTradingAllowed).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('trips immediately and emits emergency signal when max drawdown is breached', () => {
    const safeguard = new CircuitBreakerSafeguard({
      maxDrawdownPct: 0.10,
    });
    const trippedSpy = vi.fn();
    safeguard.on('tripped', trippedSpy);

    safeguard.updateNav(100000, 1000);
    const status = safeguard.updateNav(89000, 2000); // 11% drawdown

    expect(status.state).toBe('TRIPPED');
    expect(status.isTradingAllowed).toBe(false);
    expect(status.tripReason).toBe('MAX_DRAWDOWN_BREACH');
    expect(trippedSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        cancelAllOpenOrders: true,
        flattenExposure: true,
        reason: 'MAX_DRAWDOWN_BREACH',
      })
    );
  });

  it('trips on rapid loss velocity within 1-minute window', () => {
    const safeguard = new CircuitBreakerSafeguard({
      maxDrawdownPct: 0.50,
      maxLossPerMinuteUsd: 10000,
    });

    safeguard.updateNav(100000, 1000);
    safeguard.updateNav(95000, 10000);
    const status = safeguard.updateNav(89000, 20000); // 11k loss in 20s

    expect(status.state).toBe('TRIPPED');
    expect(status.tripReason).toBe('RAPID_LOSS_SPIKE');
  });

  it('transitions from TRIPPED to COOLING_DOWN and allows reset back to NORMAL', () => {
    const safeguard = new CircuitBreakerSafeguard({
      maxDrawdownPct: 0.10,
      cooldownDurationMs: 30000,
    });
    const coolingSpy = vi.fn();
    safeguard.on('coolingDown', coolingSpy);

    safeguard.updateNav(100000, 1000);
    safeguard.updateNav(85000, 2000); // tripped

    // Still within cooldown
    const status1 = safeguard.updateNav(86000, 15000);
    expect(status1.state).toBe('TRIPPED');

    // Past cooldown
    const status2 = safeguard.updateNav(87000, 35000);
    expect(status2.state).toBe('COOLING_DOWN');
    expect(coolingSpy).toHaveBeenCalled();

    // Reset back to NORMAL
    safeguard.reset();
    expect(safeguard.getStatus().state).toBe('NORMAL');
    expect(safeguard.getStatus().isTradingAllowed).toBe(true);
  });

  it('recovers from WARNING back to NORMAL when NAV recovers', () => {
    const safeguard = new CircuitBreakerSafeguard({
      maxDrawdownPct: 0.10,
      warningDrawdownPct: 0.05,
    });
    const recoveredSpy = vi.fn();
    safeguard.on('recovered', recoveredSpy);

    safeguard.updateNav(100000, 1000);
    safeguard.updateNav(94000, 2000); // 6% -> WARNING
    expect(safeguard.getStatus().state).toBe('WARNING');

    // NAV recovers to 98,000 (2% drawdown, below 5% warning)
    safeguard.updateNav(98000, 3000);
    expect(safeguard.getStatus().state).toBe('NORMAL');
    expect(recoveredSpy).toHaveBeenCalled();
  });
});
