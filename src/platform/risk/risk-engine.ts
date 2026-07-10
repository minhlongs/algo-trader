/**
 * Risk Engine — Orchestrator
 *
 * Unified entry point for all risk computations.
 * Manages feature flag, service lifecycle, and cross-module coordination.
 *
 * Services: VaR, Correlation, Drawdown, ATR Stops, Kelly Sizer.
 *
 * All services are lazy-initialized; Redis optional for single-call usage.
 */

import { getRedisClient, type RedisClientType } from '../../redis';
import { logger } from '../../shared/utils/logger';
import {
  VaRService,
  CorrelationMatrixService,
  DrawdownMonitorService,
  AtrTrailingStopService,
  KellyPositionSizerService,
} from './index';
import { RISK_FEATURE_FLAG } from './types';

const NOOP_REDIS = null as unknown as RedisClientType;

export class RiskEngine {
  private redis: RedisClientType;
  private varService: VaRService | null = null;
  private correlationService: CorrelationMatrixService | null = null;
  private drawdownService: DrawdownMonitorService | null = null;
  private atrService: AtrTrailingStopService | null = null;
  private kellyService: KellyPositionSizerService | null = null;
  private featureEnabled: boolean;

  constructor(redis?: RedisClientType, featureEnabled = true) {
    this.redis = redis || getRedisClient();
    this.featureEnabled = featureEnabled;
  }

  /**
   * Check feature flag — returns false if risk engine is disabled.
   */
  isEnabled(): boolean {
    return this.featureEnabled;
  }

  // ── Service access (lazy init) ──────────────────────────────────────────────

  private getVar(): VaRService {
    if (!this.varService) this.varService = new VaRService(this.redis);
    return this.varService;
  }

  private getCorrelation(): CorrelationMatrixService {
    if (!this.correlationService) this.correlationService = new CorrelationMatrixService(this.redis);
    return this.correlationService;
  }

  private getDrawdown(): DrawdownMonitorService {
    if (!this.drawdownService) this.drawdownService = new DrawdownMonitorService(this.redis);
    return this.drawdownService;
  }

  private getAtr(): AtrTrailingStopService {
    if (!this.atrService) this.atrService = new AtrTrailingStopService(this.redis);
    return this.atrService;
  }

  private getKelly(): KellyPositionSizerService {
    if (!this.kellyService) this.kellyService = new KellyPositionSizerService(this.redis);
    return this.kellyService;
  }

  // ── VaR / CVaR ──────────────────────────────────────────────────────────────

  async computeVaR(params: Parameters<VaRService['compute']>[0], userId: string) {
    if (!this.featureEnabled) return this.disabledResponse();
    return this.getVar().compute(params, userId);
  }

  async computeVaRWithIntervals(
    params: Parameters<VaRService['computeWithIntervals']>[0],
    userId: string,
  ) {
    if (!this.featureEnabled) return this.disabledResponse();
    return this.getVar().computeWithIntervals(params, userId);
  }

  // ── Correlation ─────────────────────────────────────────────────────────────

  async computeCorrelation(params: Parameters<CorrelationMatrixService['compute']>[0], userId: string) {
    if (!this.featureEnabled) return this.disabledResponse();
    return this.getCorrelation().compute(params, userId);
  }

  // ── Drawdown ────────────────────────────────────────────────────────────────

  async recordTrade(profit: number) {
    if (!this.featureEnabled) return null;
    return this.getDrawdown().recordTrade(profit);
  }

  async getDrawdownStatus(userId: string) {
    if (!this.featureEnabled) return this.disabledResponse();
    return this.getDrawdown().getStatus(userId);
  }

  async checkDrawdownAlerts(userId: string, thresholds?: { daily?: number; total?: number }) {
    if (!this.featureEnabled) return { alerts: [], throttled: false };
    return this.getDrawdown().checkAndAlert(userId, {
      dailyThreshold: thresholds?.daily,
      totalThreshold: thresholds?.total,
    });
  }

  async canTrade() {
    if (!this.featureEnabled) return true;
    return this.getDrawdown().canTrade();
  }

  // ── ATR Trailing Stops ──────────────────────────────────────────────────────

  computeAtrStop(params: Parameters<AtrTrailingStopService['compute']>[0]) {
    if (!this.featureEnabled) return { success: false, data: null as unknown as never, computedMs: 0 };
    return this.getAtr().compute(params);
  }

  async updateAtrState(userId: string, symbol: string, params: Parameters<AtrTrailingStopService['updatePositionState']>[2]) {
    if (!this.featureEnabled) return null;
    return this.getAtr().updatePositionState(userId, symbol, params);
  }

  async getAtrState(userId: string, symbol: string) {
    if (!this.featureEnabled) return null;
    return this.getAtr().getPositionState(userId, symbol);
  }

  async clearAtrState(userId: string, symbol: string) {
    if (!this.featureEnabled) return;
    return this.getAtr().clearPositionState(userId, symbol);
  }

  // ── Kelly Position Sizer ────────────────────────────────────────────────────

  calculateKelly(params: Parameters<KellyPositionSizerService['calculate']>[0], userId?: string) {
    if (!this.featureEnabled) return this.disabledResponse();
    return this.getKelly().calculate(params, userId);
  }

  async kellyFromTradeHistory(
    userId: string,
    tradeReturns: number[],
    portfolioValue: number,
    correlation = 0,
  ) {
    if (!this.featureEnabled) return this.disabledResponse();
    return this.getKelly().fromTradeHistory(userId, tradeReturns, portfolioValue, correlation);
  }

  // ── Cache invalidation ──────────────────────────────────────────────────────

  async invalidateUserCache(userId: string): Promise<void> {
    await Promise.allSettled([
      this.getVar().invalidate(userId),
      this.getCorrelation().invalidate(userId),
      this.redis.del(`risk:drawdown:${userId}`),
      this.redis.del(`risk:alerts:${userId}`),
    ]);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private disabledResponse() {
    return {
      success: false,
      error: `${RISK_FEATURE_FLAG} is disabled`,
      data: null,
    };
  }
}
