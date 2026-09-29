/**
 * Mock Synchronized Risk Gate Fixture
 * Real-time capital budgeting, cash buffer guard, circuit breaker gate, leverage & venue concentration
 */

import type {
  UnifiedTradeIntent,
  RiskGateVerdict,
  CircuitBreakerTier,
  EngineId,
  VenueId,
} from './harness-types';

export class MockSynchronizedRiskGate {
  private totalNavUsd = 100000;
  private liquidCashUsd = 30000;
  private currentTier: CircuitBreakerTier = 'NORMAL';
  private minCashBufferRatio = 0.20;
  private maxGrossLeverage = 3.0;
  private maxSingleVenueConcentration = 0.50;

  private engineBudgets: Record<EngineId, number> = {
    arbitrage: 20000,
    marl: 20000,
    amm: 20000,
    'alpha-lab': 20000,
  };

  private engineCommitted: Record<EngineId, number> = {
    arbitrage: 0,
    marl: 0,
    amm: 0,
    'alpha-lab': 0,
  };

  private venuePositions: Record<string, number> = {
    binance: 0,
    bybit: 0,
    polymarket_clob: 0,
    amm_cpmm: 0,
    amm_lmsr: 0,
  };

  public setTier(tier: CircuitBreakerTier): void {
    this.currentTier = tier;
  }

  public setNavAndCash(nav: number, cash: number): void {
    this.totalNavUsd = nav;
    this.liquidCashUsd = cash;
  }

  public setEngineBudgets(budgets: Record<EngineId, number>): void {
    this.engineBudgets = { ...budgets };
  }

  public setVenuePosition(venue: VenueId | string, amountUsd: number): void {
    this.venuePositions[venue] = amountUsd;
  }

  public validateOrder(intent: UnifiedTradeIntent, unitPrice?: number): RiskGateVerdict {
    const price = unitPrice ?? intent.price ?? 65000;
    const notional = intent.quantity * price;
    const currentNav = this.totalNavUsd;
    const currentCash = this.liquidCashUsd;

    // 1. Circuit Breaker Gate
    let scaledQty = intent.quantity;
    if (this.currentTier === 'HALT' || this.currentTier === 'HARD_STOP') {
      return this.reject(intent, scaledQty, `Trading halted under ${this.currentTier} circuit breaker`);
    }

    if (this.currentTier === 'ALERT' || this.currentTier === 'REDUCE') {
      if (!intent.isRiskReducing) {
        return this.reject(intent, scaledQty, `Order expansion rejected in ${this.currentTier} tier`);
      }
      const mult = this.currentTier === 'ALERT' ? 0.75 : 0.50;
      scaledQty = intent.quantity * mult;
    }

    const effectiveNotional = scaledQty * price;

    // 2. Real-Time Capital Budgeting Gate
    const engineBudget = this.engineBudgets[intent.engineId] ?? 0;
    const committed = this.engineCommitted[intent.engineId] ?? 0;
    if (committed + effectiveNotional > engineBudget) {
      return this.reject(
        intent,
        scaledQty,
        `Order notional $${effectiveNotional.toFixed(0)} exceeds remaining engine budget ($${(engineBudget - committed).toFixed(0)})`
      );
    }

    // 3. Liquid Cash Buffer Guard (C_cash >= 0.20 * NAV)
    const postOrderCash = currentCash - effectiveNotional;
    const postCashRatio = currentNav > 0 ? postOrderCash / currentNav : 0;
    if (postCashRatio < this.minCashBufferRatio) {
      return this.reject(
        intent,
        scaledQty,
        `Order violates minimum ${(this.minCashBufferRatio * 100).toFixed(0)}% liquid cash buffer (projected: ${(postCashRatio * 100).toFixed(2)}%)`
      );
    }

    // 4. Leverage & Concentration Guard
    const currentGross = Object.values(this.venuePositions).reduce((s, p) => s + Math.abs(p), 0);
    const postGross = currentGross + effectiveNotional;
    const grossLev = currentNav > 0 ? postGross / currentNav : 0;
    if (grossLev > this.maxGrossLeverage) {
      return this.reject(
        intent,
        scaledQty,
        `Gross leverage ${grossLev.toFixed(2)}x exceeds maximum ceiling ${this.maxGrossLeverage.toFixed(1)}x`
      );
    }

    const currentVenuePos = Math.abs(this.venuePositions[intent.venue] ?? 0);
    const postVenuePos = currentVenuePos + effectiveNotional;
    const venueRatio = postGross > 0 ? postVenuePos / postGross : 0;
    if (postGross > currentNav * 0.5 && venueRatio > this.maxSingleVenueConcentration) {
      return this.reject(
        intent,
        scaledQty,
        `Venue ${intent.venue} concentration ${(venueRatio * 100).toFixed(1)}% exceeds cap ${(this.maxSingleVenueConcentration * 100).toFixed(0)}%`
      );
    }

    // Passed all pre-trade risk gates!
    return {
      approved: true,
      scaledQuantity: scaledQty,
      originalQuantity: intent.quantity,
      allocatedCapitalUsd: engineBudget,
      currentNavUsd: currentNav,
      cashBufferRatio: postCashRatio,
      grossLeverage: grossLev,
      circuitBreakerTier: this.currentTier,
    };
  }

  private reject(
    intent: UnifiedTradeIntent,
    scaledQty: number,
    reason: string
  ): RiskGateVerdict {
    const price = intent.price ?? 65000;
    const currentGross = Object.values(this.venuePositions).reduce((s, p) => s + Math.abs(p), 0);
    return {
      approved: false,
      reason,
      scaledQuantity: scaledQty,
      originalQuantity: intent.quantity,
      allocatedCapitalUsd: this.engineBudgets[intent.engineId] ?? 0,
      currentNavUsd: this.totalNavUsd,
      cashBufferRatio: this.totalNavUsd > 0 ? this.liquidCashUsd / this.totalNavUsd : 0,
      grossLeverage: this.totalNavUsd > 0 ? currentGross / this.totalNavUsd : 0,
      circuitBreakerTier: this.currentTier,
    };
  }
}
