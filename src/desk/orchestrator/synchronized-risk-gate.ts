/**
 * Synchronized Risk Gate (Milestone 2 - R2)
 * Pre-trade capital allocation, cash buffer guard, circuit breaker gate, leverage & concentration.
 */

import { PortfolioAllocator } from '../portfolio/portfolio-allocator';
import type { AllocationContext, PortfolioAllocation } from '../portfolio/types';
import { GlobalCircuitBreaker } from '../risk/global-circuit-breaker';
import type { CircuitBreakerState, CircuitBreakerTier } from '../risk/portfolio-risk-types';
import { LeverageExposureGuard } from '../risk/leverage-exposure-guard';
import type { LiveExecutionGuard } from '../execution/live-execution-guard';
import type { UnifiedTradeIntent, EngineId, VenueId } from './orchestrator-types';
import { logger } from '../../shared/utils/logger';
import type { RiskGateVerdict, SynchronizedRiskGateOptions } from './risk-gate-types';
import { evaluateOrderRisk } from './risk-gate-evaluator';

export * from './risk-gate-types';

export class SynchronizedRiskGate {
  private totalNavUsd: number;
  private liquidCashUsd: number;
  private currentTier: CircuitBreakerTier = 'NORMAL';
  private readonly minCashBufferRatio: number;
  private readonly maxGrossLeverage: number;
  private readonly maxSingleVenueConcentration: number;

  private readonly allocator: PortfolioAllocator;
  private readonly circuitBreaker: GlobalCircuitBreaker;
  private readonly leverageGuard: LeverageExposureGuard;
  private readonly liveGuard?: LiveExecutionGuard;

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

  constructor(options: SynchronizedRiskGateOptions = {}) {
    this.totalNavUsd = options.totalNavUsd ?? 100000;
    this.liquidCashUsd = options.liquidCashUsd ?? 30000;
    this.minCashBufferRatio = options.minCashBufferRatio ?? 0.20;
    this.maxGrossLeverage = options.maxGrossLeverage ?? 3.0;
    this.maxSingleVenueConcentration = options.maxSingleVenueConcentration ?? 0.50;

    this.allocator = options.allocator ?? new PortfolioAllocator();
    this.circuitBreaker = options.circuitBreaker ?? new GlobalCircuitBreaker(this.totalNavUsd);
    this.leverageGuard =
      options.leverageGuard ??
      new LeverageExposureGuard(this.maxGrossLeverage, this.maxSingleVenueConcentration);
    this.liveGuard = options.liveGuard;

    if (options.initialBudgets) {
      this.engineBudgets = { ...this.engineBudgets, ...options.initialBudgets };
    }
  }

  public setTier(tier: CircuitBreakerTier): void { this.currentTier = tier; }
  public getTier(): CircuitBreakerTier { return this.currentTier; }

  public evaluateCircuitBreaker(currentNav: number, correlation = 0.25): CircuitBreakerState {
    const state = this.circuitBreaker.evaluate(currentNav, correlation);
    this.currentTier = state.tier;
    return state;
  }

  public setNavAndCash(nav: number, cash: number): void {
    this.totalNavUsd = nav;
    this.liquidCashUsd = cash;
  }

  public getNav(): number { return this.totalNavUsd; }
  public getCash(): number { return this.liquidCashUsd; }

  public setEngineBudgets(budgets: Record<EngineId, number>): void {
    this.engineBudgets = { ...budgets };
  }

  public getEngineBudgets(): Readonly<Record<EngineId, number>> { return this.engineBudgets; }
  public setEngineCommitted(engineId: EngineId, amountUsd: number): void {
    this.engineCommitted[engineId] = amountUsd;
  }

  public setVenuePosition(venue: VenueId | string, amountUsd: number): void {
    this.venuePositions[venue] = amountUsd;
  }

  public reallocate(context: AllocationContext): PortfolioAllocation {
    const allocation = this.allocator.allocate(context);
    this.setEngineBudgets(allocation.allocatedCapitalUsd);
    return allocation;
  }

  public commitFill(engineId: EngineId, venue: string, notionalUsd: number): void {
    this.engineCommitted[engineId] = (this.engineCommitted[engineId] ?? 0) + notionalUsd;
    this.venuePositions[venue] = (this.venuePositions[venue] ?? 0) + notionalUsd;
    this.liquidCashUsd -= notionalUsd;
  }

  public getAllocator(): PortfolioAllocator { return this.allocator; }
  public getCircuitBreaker(): GlobalCircuitBreaker { return this.circuitBreaker; }
  public getLeverageGuard(): LeverageExposureGuard { return this.leverageGuard; }
  public getLiveGuard(): LiveExecutionGuard | undefined { return this.liveGuard; }

  public validateOrder(intent: UnifiedTradeIntent, unitPrice?: number): RiskGateVerdict {
    const price = unitPrice ?? intent.price ?? 65000;
    const res = evaluateOrderRisk(intent, price, {
      currentTier: this.currentTier,
      currentNav: this.totalNavUsd,
      currentCash: this.liquidCashUsd,
      minCashBufferRatio: this.minCashBufferRatio,
      maxGrossLeverage: this.maxGrossLeverage,
      maxSingleVenueConcentration: this.maxSingleVenueConcentration,
      engineBudget: this.engineBudgets[intent.engineId] ?? 0,
      committed: this.engineCommitted[intent.engineId] ?? 0,
      venuePositions: this.venuePositions,
    });

    if (!res.approved) {
      logger.debug(`[SynchronizedRiskGate] Order rejected: ${res.reason}`, { intentId: intent.intentId });
      return {
        approved: false,
        reason: res.reason,
        scaledQuantity: res.scaledQty,
        originalQuantity: intent.quantity,
        allocatedCapitalUsd: this.engineBudgets[intent.engineId] ?? 0,
        currentNavUsd: this.totalNavUsd,
        cashBufferRatio: res.postCashRatio,
        grossLeverage: res.grossLev,
        circuitBreakerTier: this.currentTier,
      };
    }

    return {
      approved: true,
      scaledQuantity: res.scaledQty,
      originalQuantity: intent.quantity,
      allocatedCapitalUsd: this.engineBudgets[intent.engineId] ?? 0,
      currentNavUsd: this.totalNavUsd,
      cashBufferRatio: res.postCashRatio,
      grossLeverage: res.grossLev,
      circuitBreakerTier: this.currentTier,
    };
  }
}
