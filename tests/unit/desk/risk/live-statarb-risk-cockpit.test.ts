import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LiveStatArbRiskCockpit } from '../../../../src/desk/risk/live-statarb-risk-cockpit';
import type { CandidateOrder } from '../../../../src/desk/risk/live-statarb-risk-types';
import type { CompensatoryUnwindHandler } from '../../../../src/desk/arbitrage/compensatory-unwind-handler';

describe('LiveStatArbRiskCockpit Pre-Trade Risk & Unwind Coordination', () => {
  let mockUnwindHandler: CompensatoryUnwindHandler;
  let cockpit: LiveStatArbRiskCockpit;

  beforeEach(() => {
    mockUnwindHandler = {
      executeUnwind: vi.fn().mockResolvedValue({
        success: true,
        executionId: 'test-exec',
        unwoundLegs: [],
        failedLegs: [],
      }),
    } as unknown as CompensatoryUnwindHandler;

    cockpit = new LiveStatArbRiskCockpit(
      {
        portfolioNav: 100000,
        maxVaRThreshold: 5000,
        maxCVaRThreshold: 8000,
        confidence: 0.95,
        horizonDays: 1,
        autoUnwindOnBreach: true,
      },
      mockUnwindHandler
    );
  });

  it('allows normal order when returns and projected risk are well within bounds', async () => {
    // Record low-volatility benign returns
    cockpit.recordReturns([0.005, -0.002, 0.003, -0.001, 0.004, 0.002, -0.003, 0.001]);

    const order: CandidateOrder = {
      orderId: 'ord-1',
      symbol: 'POLY-YES',
      side: 'BUY',
      quantity: 100,
      price: 0.5,
      expectedReturn: 0.01,
    };

    const evalResult = await cockpit.evaluatePreTrade(order);
    expect(evalResult.allowed).toBe(true);
    expect(evalResult.cockpitStatus).toBe('NORMAL');
    expect(evalResult.unwindTriggered).toBe(false);
    expect(mockUnwindHandler.executeUnwind).not.toHaveBeenCalled();
  });

  it('blocks order and transitions to ELEVATED/CRITICAL when single order exceeds 50% NAV cap', async () => {
    const hugeOrder: CandidateOrder = {
      orderId: 'ord-huge',
      symbol: 'POLY-NO',
      side: 'BUY',
      quantity: 200000,
      price: 0.6, // $120,000 > $50,000 (50% NAV)
    };

    const evalResult = await cockpit.evaluatePreTrade(hugeOrder);
    expect(evalResult.allowed).toBe(false);
    expect(evalResult.cockpitStatus).toBe('CRITICAL');
    expect(evalResult.reason).toContain('exceeds 50% single-order portfolio cap');
    expect(evalResult.unwindTriggered).toBe(true);
    expect(mockUnwindHandler.executeUnwind).toHaveBeenCalledOnce();
  });

  it('blocks order and triggers compensatory unwind when tail stress CVaR breaches threshold', async () => {
    // Inject severe negative tail returns
    cockpit.recordReturns([-0.08, -0.09, -0.12, -0.07, -0.15, -0.06, -0.08, -0.10]);

    const riskyOrder: CandidateOrder = {
      orderId: 'ord-risky',
      symbol: 'POLY-YES',
      side: 'BUY',
      quantity: 1000,
      price: 0.5,
      expectedReturn: -0.20, // extreme negative shock
    };

    const unwindSpy = vi.fn();
    cockpit.on('unwindTriggered', unwindSpy);

    const evalResult = await cockpit.evaluatePreTrade(riskyOrder);
    expect(evalResult.allowed).toBe(false);
    expect(evalResult.cockpitStatus).toBe('CRITICAL');
    expect(evalResult.unwindTriggered).toBe(true);
    expect(unwindSpy).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'ord-risky' })
    );
    expect(mockUnwindHandler.executeUnwind).toHaveBeenCalledOnce();
  });

  it('provides real-time snapshot of VaR and CVaR metrics', () => {
    cockpit.recordReturns([0.01, -0.02, 0.015, -0.005, 0.02, -0.018]);
    const snapshot = cockpit.getSnapshot();

    expect(snapshot.portfolioNav).toBe(100000);
    expect(snapshot.returnsCount).toBe(6);
    expect(Number.isFinite(snapshot.cornishFisherVaR)).toBe(true);
    expect(Number.isFinite(snapshot.expectedShortfall)).toBe(true);
    expect(snapshot.maxVaRThreshold).toBe(5000);
    expect(snapshot.maxCVaRThreshold).toBe(8000);
  });

  it('respects autoUnwindOnBreach = false flag without calling unwind handler', async () => {
    const noUnwindCockpit = new LiveStatArbRiskCockpit(
      {
        portfolioNav: 100000,
        autoUnwindOnBreach: false,
      },
      mockUnwindHandler
    );

    const hugeOrder: CandidateOrder = {
      orderId: 'ord-huge-no-unwind',
      symbol: 'POLY-NO',
      side: 'BUY',
      quantity: 200000,
      price: 0.6,
    };

    const evalResult = await noUnwindCockpit.evaluatePreTrade(hugeOrder);
    expect(evalResult.allowed).toBe(false);
    expect(evalResult.unwindTriggered).toBe(false);
    expect(mockUnwindHandler.executeUnwind).not.toHaveBeenCalled();
  });
});
