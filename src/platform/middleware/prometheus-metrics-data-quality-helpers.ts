/**
 * Data Quality Helper Functions for Prometheus Metrics
 *
 * Submodule extracted from prometheus-metrics.ts to keep files under 200 lines.
 * Contains helper functions for recording market data quality events.
 */

import {
  dataGapsTotal,
  gapDetectionDuration,
  expectedCandles,
  receivedCandles,
  candleCompleteness,
  outlierEventsTotal,
  outlierZScore,
  failoverEventsTotal,
  providerHealthScore,
  providerAvailability,
  providerErrorRate,
  slaComplianceTotal,
} from './prometheus-registry';

export function recordDataGap(provider: string, symbol: string, _durationMs?: number): void {
  dataGapsTotal.inc({ provider, symbol });
}

export function recordGapDetectionDuration(provider: string, symbol: string, seconds: number): void {
  void provider;
  void symbol;
  gapDetectionDuration.observe(seconds);
}

export function setExpectedCandles(_provider: string, symbol: string, timeframe: string, count: number): void {
  expectedCandles.set({ symbol, timeframe }, count);
}

export function setReceivedCandles(provider: string, symbol: string, timeframe: string, count: number): void {
  void provider;
  receivedCandles.set({ symbol, timeframe }, count);
}

export function setCandleCompleteness(provider: string, symbol: string, timeframe: string, ratio: number): void {
  void provider;
  candleCompleteness.set({ symbol, timeframe }, ratio);
}

export function recordOutlierEvent(provider: string, symbol: string, field: string): void {
  outlierEventsTotal.inc({ provider, symbol, field });
}

export function recordOutlierZScore(provider: string, symbol: string, field: string, zScore: number): void {
  outlierZScore.observe({ provider, symbol, field }, zScore);
}

export function recordFailoverEvent(provider: string, direction: 'primary_to_fallback' | 'fallback_to_primary'): void {
  failoverEventsTotal.inc({ provider, direction });
}

export function setProviderHealthScore(provider: string, score: number): void {
  providerHealthScore.set({ provider }, score);
}

export function setProviderAvailability(provider: string, ratio: number): void {
  providerAvailability.set({ provider }, ratio);
}

export function setProviderErrorRate(provider: string, rate: number): void {
  providerErrorRate.set({ provider }, rate);
}

export function recordSlaCompliance(provider: string, compliant: boolean): void {
  slaComplianceTotal.inc({ provider, result: compliant ? 'compliant' : 'breached' });
}
