/**
 * EOD Execution Monitoring & Microstructure Diagnostics (IC Report Agent #6, pp. 49–50).
 *
 * Computes end-of-day maker markout curves (5s / 60s / 300s), cancel ACK latency
 * percentiles (p50 / p95 / p99), post-only rejection ratios, order-scoring coverage,
 * HTTP 425 matching-engine cooldowns, and GhostGuard `status=0` settlement alerts.
 */

export type EodHealthStatus = 'HEALTHY' | 'DEGRADED' | 'HALT_RECOMMENDED' | 'CRITICAL_HALT';

export interface EodMarkoutSample {
  readonly side: 'buy' | 'sell' | 'yes' | 'no';
  readonly fillPrice: number;
  readonly sizeShares: number;
  readonly midAt5s?: number;
  readonly midAt60s: number;
  readonly midAt300s?: number;
  readonly makerRebateBps: number;
  readonly liquidityRewardBps: number;
}

export interface EodExecutionTelemetryInput {
  readonly tradingDateIso: string;
  readonly markouts: readonly EodMarkoutSample[];
  readonly cancelAckLatenciesMs: readonly number[];
  readonly totalCancels: number;
  readonly totalFills: number;
  readonly postOnlySubmitted: number;
  readonly postOnlyRejected: number;
  readonly restingOrdersSampled: number;
  readonly restingOrdersScoring: number;
  readonly heartbeatMisses: number;
  readonly http425CooldownCount: number;
  readonly ghostFillCount: number;
}

export interface EodExecutionDiagnosticsThresholds {
  readonly minNetMarkout60sBps?: number;
  readonly maxCancelAckP99Ms?: number;
  readonly maxPostOnlyRejectPct?: number;
  readonly minOrderScoringCoveragePct?: number;
  readonly maxCancelToFillRatio?: number;
}

export interface EodExecutionDiagnosticsReport {
  readonly tradingDateIso: string;
  readonly status: EodHealthStatus;
  readonly meanMarkout5sNetBps: number | null;
  readonly meanMarkout60sNetBps: number | null;
  readonly meanMarkout300sNetBps: number | null;
  readonly cancelAckP50Ms: number | null;
  readonly cancelAckP95Ms: number | null;
  readonly cancelAckP99Ms: number | null;
  readonly cancelToFillRatio: number | null;
  readonly postOnlyRejectPct: number | null;
  readonly orderScoringCoveragePct: number | null;
  readonly heartbeatMisses: number;
  readonly http425CooldownCount: number;
  readonly ghostFillCount: number;
  readonly alerts: readonly string[];
}

function percentile(sortedAsc: readonly number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1));
  return sortedAsc[idx]!;
}

function signedMarkoutBps(
  side: EodMarkoutSample['side'],
  fillPrice: number,
  horizonMid: number,
  rebateBps: number,
  rewardBps: number,
): number {
  const isBuy = side === 'buy' || side === 'yes';
  const rawMove = isBuy ? horizonMid - fillPrice : fillPrice - horizonMid;
  return rawMove * 10_000 + rebateBps + rewardBps;
}

function weightedMeanHorizonBps(
  samples: readonly EodMarkoutSample[],
  pickMid: (s: EodMarkoutSample) => number | undefined,
): number | null {
  let weightedSum = 0;
  let totalShares = 0;
  for (const s of samples) {
    const mid = pickMid(s);
    if (mid === undefined || !Number.isFinite(mid) || !(s.sizeShares > 0)) continue;
    weightedSum += s.sizeShares * signedMarkoutBps(s.side, s.fillPrice, mid, s.makerRebateBps, s.liquidityRewardBps);
    totalShares += s.sizeShares;
  }
  return totalShares > 0 ? weightedSum / totalShares : null;
}

export function evaluateEodExecutionDiagnostics(
  input: EodExecutionTelemetryInput,
  thresholds: EodExecutionDiagnosticsThresholds = {},
): EodExecutionDiagnosticsReport {
  const minMarkout60s = thresholds.minNetMarkout60sBps ?? 15.0;
  const maxCancelP99 = thresholds.maxCancelAckP99Ms ?? 1_000;
  const maxPostOnlyRej = thresholds.maxPostOnlyRejectPct ?? 30.0;
  const minScoringCov = thresholds.minOrderScoringCoveragePct ?? 70.0;
  const maxCancelToFill = thresholds.maxCancelToFillRatio ?? 25.0;

  const validLatencies = input.cancelAckLatenciesMs.filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  const cancelAckP50Ms = percentile(validLatencies, 50);
  const cancelAckP95Ms = percentile(validLatencies, 95);
  const cancelAckP99Ms = percentile(validLatencies, 99);

  const meanMarkout5sNetBps = weightedMeanHorizonBps(input.markouts, (s) => s.midAt5s);
  const meanMarkout60sNetBps = weightedMeanHorizonBps(input.markouts, (s) => s.midAt60s);
  const meanMarkout300sNetBps = weightedMeanHorizonBps(input.markouts, (s) => s.midAt300s);

  const cancelToFillRatio = input.totalFills > 0 ? input.totalCancels / input.totalFills : null;
  const postOnlyRejectPct =
    input.postOnlySubmitted > 0 ? (input.postOnlyRejected / input.postOnlySubmitted) * 100 : null;
  const orderScoringCoveragePct =
    input.restingOrdersSampled > 0 ? (input.restingOrdersScoring / input.restingOrdersSampled) * 100 : null;

  const alerts: string[] = [];
  let status: EodHealthStatus = 'HEALTHY';

  const escalate = (next: EodHealthStatus): void => {
    const rank: Record<EodHealthStatus, number> = {
      HEALTHY: 0, DEGRADED: 1, HALT_RECOMMENDED: 2, CRITICAL_HALT: 3,
    };
    if (rank[next] > rank[status]) status = next;
  };

  if (input.ghostFillCount > 0) {
    alerts.push(`GhostGuard detected ${input.ghostFillCount} status=0 settlement failure(s)`);
    escalate('CRITICAL_HALT');
  }
  if (cancelAckP99Ms !== null && cancelAckP99Ms > maxCancelP99) {
    alerts.push(`Cancel ACK p99 ${cancelAckP99Ms.toFixed(0)}ms exceeds ${maxCancelP99}ms safety ceiling`);
    escalate('HALT_RECOMMENDED');
  }
  if (meanMarkout60sNetBps !== null && meanMarkout60sNetBps < 0) {
    alerts.push(`Negative 60s net maker markout (${meanMarkout60sNetBps.toFixed(1)} bps < 0 bps)`);
    escalate('HALT_RECOMMENDED');
  } else if (meanMarkout60sNetBps !== null && meanMarkout60sNetBps < minMarkout60s) {
    alerts.push(`60s net maker markout ${meanMarkout60sNetBps.toFixed(1)} bps below +${minMarkout60s} bps target`);
    escalate('DEGRADED');
  }
  if (postOnlyRejectPct !== null && postOnlyRejectPct > maxPostOnlyRej) {
    alerts.push(`Post-only rejection rate ${postOnlyRejectPct.toFixed(1)}% exceeds ${maxPostOnlyRej}% limit`);
    escalate('DEGRADED');
  }
  if (orderScoringCoveragePct !== null && orderScoringCoveragePct < minScoringCov) {
    alerts.push(`Order-scoring coverage ${orderScoringCoveragePct.toFixed(1)}% below ${minScoringCov}% target`);
    escalate('DEGRADED');
  }
  if (cancelToFillRatio !== null && cancelToFillRatio > maxCancelToFill) {
    alerts.push(`Cancel-to-fill ratio ${cancelToFillRatio.toFixed(1)}x exceeds ${maxCancelToFill}x threshold`);
    escalate('DEGRADED');
  }
  if (input.heartbeatMisses > 0) {
    alerts.push(`Observed ${input.heartbeatMisses} CLOB V2 heartbeat miss(es)`);
    escalate('DEGRADED');
  }

  return {
    tradingDateIso: input.tradingDateIso,
    status,
    meanMarkout5sNetBps,
    meanMarkout60sNetBps,
    meanMarkout300sNetBps,
    cancelAckP50Ms,
    cancelAckP95Ms,
    cancelAckP99Ms,
    cancelToFillRatio,
    postOnlyRejectPct,
    orderScoringCoveragePct,
    heartbeatMisses: input.heartbeatMisses,
    http425CooldownCount: input.http425CooldownCount,
    ghostFillCount: input.ghostFillCount,
    alerts,
  };
}
