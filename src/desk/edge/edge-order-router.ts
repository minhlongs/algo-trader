/**
 * Geographic Edge Order Router
 * Determines optimal colocation execution cluster based on EWMA RTT and packet loss.
 *
 * @module desk/edge/edge-order-router
 */

import { EdgeRegion, RegionLatencyMetric, RoutingDecision } from './edge-hft-types';

export interface EdgeRouterOptions {
  readonly defaultRegion?: EdgeRegion;
  readonly maxAllowableRttMs?: number;
  readonly packetLossPenaltyWeight?: number;
}

export class EdgeOrderRouter {
  private readonly defaultRegion: EdgeRegion;
  private readonly maxAllowableRttMs: number;
  private readonly packetLossPenaltyWeight: number;
  private readonly regionLatencies = new Map<EdgeRegion, RegionLatencyMetric>();

  public constructor(options?: EdgeRouterOptions) {
    this.defaultRegion = options?.defaultRegion ?? 'tokyo';
    this.maxAllowableRttMs = options?.maxAllowableRttMs ?? 150;
    this.packetLossPenaltyWeight = options?.packetLossPenaltyWeight ?? 10;
  }

  public updateLatency(metric: RegionLatencyMetric): void {
    this.regionLatencies.set(metric.region, metric);
  }

  public routeOrder(preferredRegion?: EdgeRegion): RoutingDecision {
    if (this.regionLatencies.size === 0) {
      return {
        selectedRegion: preferredRegion ?? this.defaultRegion,
        estimatedRttMs: 50,
        reason: 'Default configuration - no live metrics recorded',
      };
    }

    const ranked = Array.from(this.regionLatencies.values())
      .map((metric) => ({
        region: metric.region,
        effectiveScore: metric.rttMs + metric.packetLossPct * this.packetLossPenaltyWeight,
        rawRtt: metric.rttMs,
      }))
      .sort((a, b) => a.effectiveScore - b.effectiveScore);

    const primary = ranked[0];
    if (!primary || primary.rawRtt > this.maxAllowableRttMs) {
      return {
        selectedRegion: this.defaultRegion,
        estimatedRttMs: primary ? primary.rawRtt : 100,
        reason: 'Fallback to default: best region exceeds allowable RTT latency',
      };
    }

    const fallback = ranked.length > 1 ? ranked[1]?.region : undefined;

    return {
      selectedRegion: primary.region,
      estimatedRttMs: primary.rawRtt,
      fallbackRegion: fallback,
      reason: `Optimal colocation path with effective score ${primary.effectiveScore.toFixed(2)}`,
    };
  }

  public getRegionMetric(region: EdgeRegion): RegionLatencyMetric | undefined {
    return this.regionLatencies.get(region);
  }
}
