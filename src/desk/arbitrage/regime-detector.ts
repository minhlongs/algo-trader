/**
 * Regime Detector
 * Detects market regime changes affecting arbitrage strategy
 *
 * Regimes:
 * - NORMAL: Stable spreads, low volatility
 * - VOLATILE: High volatility, wider spreads
 * - TRENDING: Strong directional movement
 * - CRASH: Extreme volatility, liquidity crisis
 */

import { getRedisClient, type RedisClientType } from '../../redis';
import { logger } from '../../shared/utils/logger';
import { MarketRegime, RegimeMetrics, RegimeConfig } from './regime-detector-types';
import { calculateVolatility, calculateSpreadStats } from './regime-detector-math';
import { fetchHistoricalSpreads, saveRegimeMetrics } from './regime-detector-store';

export * from './regime-detector-types';
export * from './regime-detector-math';
export * from './regime-detector-store';

export class RegimeDetector {
  private redis: RedisClientType;
  private config: RegimeConfig;
  private currentRegime: MarketRegime = 'NORMAL';
  private regimeHistory: MarketRegime[] = [];

  constructor(redis?: RedisClientType, config?: Partial<RegimeConfig>) {
    this.redis = redis || getRedisClient();
    this.config = {
      volatilityThresholds: {
        normal: 0.5,
        volatile: 1.5,
        crash: 3.0,
      },
      lookbackPeriods: 100,
      checkIntervalMs: 5000,
      ...config,
    };
  }

  private calculateVolatility(prices: number[]): number {
    return calculateVolatility(prices);
  }

  private calculateSpreadStats(spreads: number[]): { avg: number; stdDev: number } {
    return calculateSpreadStats(spreads);
  }

  private async getHistoricalSpreads(symbol: string, exchanges: string[], periods: number): Promise<number[]> {
    return fetchHistoricalSpreads(this.redis, symbol, exchanges, periods);
  }

  async detectRegime(symbol: string, exchanges: string[]): Promise<RegimeMetrics> {
    const spreads = await this.getHistoricalSpreads(symbol, exchanges, this.config.lookbackPeriods);
    const { avg: spreadAvg, stdDev: spreadStdDev } = this.calculateSpreadStats(spreads);
    const volatility = this.calculateVolatility(spreads);

    let regime: MarketRegime = 'NORMAL';
    let confidence = 0.5;

    if (volatility >= this.config.volatilityThresholds.crash) {
      regime = 'CRASH';
      confidence = 0.9;
    } else if (volatility >= this.config.volatilityThresholds.volatile) {
      regime = 'VOLATILE';
      confidence = 0.8;
    } else if (volatility >= this.config.volatilityThresholds.normal) {
      regime = 'TRENDING';
      confidence = 0.7;
    } else {
      regime = 'NORMAL';
      confidence = 0.8;
    }

    return {
      regime,
      volatility,
      spreadAvg,
      spreadStdDev,
      volumeChange: 0,
      confidence,
      timestamp: Date.now(),
    };
  }

  private updateRegime(metrics: RegimeMetrics): void {
    this.regimeHistory.push(metrics.regime);
    if (this.regimeHistory.length > 10) {
      this.regimeHistory.shift();
    }

    const lastThree = this.regimeHistory.slice(-3);
    if (
      lastThree.length === 3 &&
      lastThree.every(r => r === metrics.regime) &&
      metrics.regime !== this.currentRegime
    ) {
      this.currentRegime = metrics.regime;
    }
  }

  start(symbol: string, exchanges: string[], onRegimeChange: (metrics: RegimeMetrics) => void): void {
    const check = async () => {
      try {
        const metrics = await this.detectRegime(symbol, exchanges);
        const previousRegime = this.currentRegime;
        this.updateRegime(metrics);

        if (this.currentRegime !== previousRegime) {
          onRegimeChange(metrics);
        }
      } catch (error) {
        logger.error('RegimeDetector error:', { error });
      }
    };

    check();
    setInterval(check, this.config.checkIntervalMs);
  }

  getCurrentRegime(): MarketRegime {
    return this.currentRegime;
  }

  getHistory(): MarketRegime[] {
    return [...this.regimeHistory];
  }

  async storeMetrics(metrics: RegimeMetrics, symbol: string): Promise<void> {
    return saveRegimeMetrics(this.redis, symbol, metrics);
  }
}
