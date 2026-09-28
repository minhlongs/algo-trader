/**
 * AMM Telemetry & Prometheus Metrics Instrumentation
 * Tracks liquidity depth, trade volume, arbitrage PnL, and VPIN toxicity
 * (Milestone 4 / Feature 13)
 */

import { AmmMetricsSnapshot } from '../types/telemetry-types';

export class AmmMetricsRecorder {
  private liquidityDepthUsd: number = 0;
  private tradeVolumeUsd: number = 0;
  private arbitragePnlUsd: number = 0;
  private vpinToxicity: number = 0;
  private circuitBreakerTripped: boolean = false;
  private activePoolsCount: number = 0;
  private tripwireActivations: number = 0;

  public recordTrade(volumeUsd: number, pnlUsd?: number): void {
    this.tradeVolumeUsd += Math.max(0, volumeUsd);
    if (pnlUsd !== undefined) {
      this.arbitragePnlUsd += pnlUsd;
    }
  }

  public setLiquidityDepth(depthUsd: number): void {
    this.liquidityDepthUsd = Math.max(0, depthUsd);
  }

  public setVpinToxicity(vpin: number): void {
    this.vpinToxicity = Math.max(0, Math.min(1.0, vpin));
  }

  public setCircuitBreakerTripped(tripped: boolean): void {
    this.circuitBreakerTripped = tripped;
  }

  public setActivePoolsCount(count: number): void {
    this.activePoolsCount = Math.max(0, count);
  }

  public recordTripwireActivation(): void {
    this.tripwireActivations += 1;
  }

  public getSnapshot(): AmmMetricsSnapshot {
    return {
      liquidityDepthUsd: this.liquidityDepthUsd,
      tradeVolumeUsd: this.tradeVolumeUsd,
      arbitragePnlUsd: this.arbitragePnlUsd,
      vpinToxicity: this.vpinToxicity,
      circuitBreakerTripped: this.circuitBreakerTripped,
      activePoolsCount: this.activePoolsCount,
      tripwireActivations: this.tripwireActivations,
      timestampMs: Date.now(),
    };
  }

  public exportPrometheusMetrics(): string {
    const s = this.getSnapshot();
    return [
      '# HELP amm_liquidity_depth_usd Current total liquidity depth in USD across active AMM pools',
      '# TYPE amm_liquidity_depth_usd gauge',
      `amm_liquidity_depth_usd ${s.liquidityDepthUsd.toFixed(2)}`,
      '# HELP amm_trade_volume_usd Cumulative trading volume in USD across AMM pools',
      '# TYPE amm_trade_volume_usd counter',
      `amm_trade_volume_usd ${s.tradeVolumeUsd.toFixed(2)}`,
      '# HELP amm_arbitrage_pnl_usd Cumulative realized arbitrage PnL in USD',
      '# TYPE amm_arbitrage_pnl_usd gauge',
      `amm_arbitrage_pnl_usd ${s.arbitragePnlUsd.toFixed(4)}`,
      '# HELP amm_vpin_toxicity Current VPIN toxicity score [0.0, 1.0]',
      '# TYPE amm_vpin_toxicity gauge',
      `amm_vpin_toxicity ${s.vpinToxicity.toFixed(4)}`,
      '# HELP amm_circuit_breaker_tripped Circuit breaker status (1 = tripped, 0 = normal)',
      '# TYPE amm_circuit_breaker_tripped gauge',
      `amm_circuit_breaker_tripped ${s.circuitBreakerTripped ? 1 : 0}`,
      '# HELP amm_active_pools_count Number of registered and active AMM pools',
      '# TYPE amm_active_pools_count gauge',
      `amm_active_pools_count ${s.activePoolsCount}`,
    ].join('\n');
  }
}
