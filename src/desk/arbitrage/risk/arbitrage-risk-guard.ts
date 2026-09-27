/**
 * Pre-trade risk guard for multi-exchange arbitrage execution.
 *
 * Enforces Quarter-Kelly position sizing (5% hard cap), notional and venue/symbol
 * open position caps, 15% daily drawdown circuit breakers, venue latency breakers,
 * and fail-closed paper vs live mode credential and balance validation.
 *
 * @module desk/arbitrage/risk/arbitrage-risk-guard
 */

import {
  type ArbitrageRiskConfig,
  type MultiLegArbitrageBasket,
  type ArbitrageRiskCheckResult,
  type ArbitrageRiskContext,
  type ArbitrageRiskCheckParams,
  DEFAULT_ARBITRAGE_RISK_CONFIG,
} from './arbitrage-risk-types';
import { KellyPositionSizer } from '../../risk/kelly-position-sizer';
import { RiskGateManager } from '../../risk/risk-gate-manager';
import { LiveExecutionGuard } from '../../execution/live-execution-guard-core';
import type { TieredDrawdownBreaker } from '../../risk/tiered-drawdown-breaker';
import type { DrawdownMonitor } from '../../risk/drawdown-monitor';
import type { CircuitBreaker } from '../../risk/circuit-breaker';
import type { SpreadDetector } from '../spread-detector';
import { ExposureTracker } from './arbitrage-risk-guard-exposure';
import { runGatePipeline, adaptPreTradeParamsToBasket } from './arbitrage-risk-guard-pipeline';
import { computeQuarterKellySizingFormula } from './arbitrage-risk-guard-sizing';

export * from './arbitrage-risk-types';
export * from './arbitrage-risk-guard-drawdown';
export * from './arbitrage-risk-guard-latency-credentials';
export * from './arbitrage-risk-guard-balance';
export * from './arbitrage-risk-guard-sizing';
export * from './arbitrage-risk-guard-exposure';
export * from './arbitrage-risk-guard-pipeline';

export interface ArbitrageRiskGuardDependencies {
  riskGateManager?: RiskGateManager;
  liveExecutionGuard?: LiveExecutionGuard;
  kellyPositionSizer?: KellyPositionSizer;
  tieredDrawdownBreaker?: TieredDrawdownBreaker;
  drawdownMonitor?: DrawdownMonitor;
  circuitBreaker?: CircuitBreaker;
  spreadDetector?: SpreadDetector;
}

export class ArbitrageRiskGuard {
  private config: ArbitrageRiskConfig;
  private readonly liveExecutionGuard: LiveExecutionGuard;
  private readonly riskGateManager: RiskGateManager;
  private readonly kellyPositionSizer: KellyPositionSizer;
  private readonly tieredDrawdownBreaker?: TieredDrawdownBreaker;
  private readonly drawdownMonitor?: DrawdownMonitor;
  private readonly circuitBreaker?: CircuitBreaker;
  private readonly spreadDetector?: SpreadDetector;
  private readonly exposureTracker = new ExposureTracker();

  constructor(config?: Partial<ArbitrageRiskConfig>, deps?: ArbitrageRiskGuardDependencies) {
    this.config = { ...DEFAULT_ARBITRAGE_RISK_CONFIG, ...config };
    this.circuitBreaker = deps?.circuitBreaker;
    this.tieredDrawdownBreaker = deps?.tieredDrawdownBreaker;
    this.drawdownMonitor = deps?.drawdownMonitor;
    this.spreadDetector = deps?.spreadDetector;

    this.liveExecutionGuard =
      deps?.liveExecutionGuard ??
      new LiveExecutionGuard({
        capitalUsdc: this.config.capitalUsdc,
        maxDailyDrawdown: this.config.maxDailyDrawdownFraction,
        maxPositionFraction: this.config.maxKellyPositionFraction,
        enabled: true,
      });

    this.riskGateManager =
      deps?.riskGateManager ?? new RiskGateManager(this.liveExecutionGuard, this.circuitBreaker);

    this.kellyPositionSizer =
      deps?.kellyPositionSizer ??
      new KellyPositionSizer({
        kellyFraction: this.config.kellyFraction,
        maxPositionFraction: this.config.maxKellyPositionFraction,
        minPositionUsd: 10,
      });
  }

  async checkBasket(
    basket: MultiLegArbitrageBasket,
    context?: ArbitrageRiskContext,
  ): Promise<ArbitrageRiskCheckResult> {
    return runGatePipeline(basket, context, {
      config: this.config,
      liveExecutionGuard: this.liveExecutionGuard,
      riskGateManager: this.riskGateManager,
      kellyPositionSizer: this.kellyPositionSizer,
      tieredDrawdownBreaker: this.tieredDrawdownBreaker,
      drawdownMonitor: this.drawdownMonitor,
      circuitBreaker: this.circuitBreaker,
      spreadDetector: this.spreadDetector,
      exposureTracker: this.exposureTracker,
    });
  }

  async checkPreTrade(
    basketOrParams: MultiLegArbitrageBasket | ArbitrageRiskCheckParams,
    context?: ArbitrageRiskContext,
  ): Promise<ArbitrageRiskCheckResult> {
    if ('legs' in basketOrParams) {
      return this.checkBasket(basketOrParams, context);
    }
    const { basket, mergedContext } = adaptPreTradeParamsToBasket(basketOrParams, context);
    return this.checkBasket(basket, mergedContext);
  }

  recordTradeOpened(basket: MultiLegArbitrageBasket): void;
  recordTradeOpened(symbol: string, buyVenue: string, sellVenue: string, notional: number): void;
  recordTradeOpened(
    basketOrSymbol: MultiLegArbitrageBasket | string,
    buyVenue?: string,
    sellVenue?: string,
    notional?: number,
  ): void {
    this.exposureTracker.recordTradeOpened(basketOrSymbol, buyVenue, sellVenue, notional);
  }

  recordTradeClosed(basket: MultiLegArbitrageBasket): void;
  recordTradeClosed(symbol: string, buyVenue: string, sellVenue: string, notional: number): void;
  recordTradeClosed(
    basketOrSymbol: MultiLegArbitrageBasket | string,
    buyVenue?: string,
    sellVenue?: string,
    notional?: number,
  ): void {
    this.exposureTracker.recordTradeClosed(basketOrSymbol, buyVenue, sellVenue, notional);
  }

  getExposures(): { venues: Record<string, number>; symbols: Record<string, number> } {
    return this.exposureTracker.getExposures();
  }

  resetExposures(): void {
    this.exposureTracker.resetExposures();
  }

  computeQuarterKellySizing(
    requestedNotional: number,
    bankroll: number,
    p: number,
    b: number,
  ): number {
    return computeQuarterKellySizingFormula(
      requestedNotional,
      bankroll,
      p,
      b,
      this.config.maxKellyPositionFraction,
      this.config.maxPerTradeNotionalUsd,
    );
  }

  getConfig(): Readonly<ArbitrageRiskConfig> {
    return this.config;
  }

  updateConfig(patch: Partial<ArbitrageRiskConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  getLiveExecutionGuard(): LiveExecutionGuard {
    return this.liveExecutionGuard;
  }

  getRiskGateManager(): RiskGateManager {
    return this.riskGateManager;
  }

  getKellyPositionSizer(): KellyPositionSizer {
    return this.kellyPositionSizer;
  }

  getTieredDrawdownBreaker(): TieredDrawdownBreaker | undefined {
    return this.tieredDrawdownBreaker;
  }

  getDrawdownMonitor(): DrawdownMonitor | undefined {
    return this.drawdownMonitor;
  }

  getCircuitBreaker(): CircuitBreaker | undefined {
    return this.circuitBreaker;
  }

  getSpreadDetector(): SpreadDetector | undefined {
    return this.spreadDetector;
  }
}
