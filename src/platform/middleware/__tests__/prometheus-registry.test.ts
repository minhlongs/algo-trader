/**
 * Tests for prometheus-registry module.
 *
 * Covers: registry creation, metric definitions (gauges, counters, histograms),
 * default metrics collection, and metric interaction (increment, set, observe).
 */

import { describe, it, expect, vi } from 'vitest';

// Mock logger to prevent console noise
vi.mock('../../../shared/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import {
  register,
  qwenPaperPnlPct,
  qwenSignalsTotal,
  qwenStrategyReviewsQueuedTotal,
  qwenStrategyReviewsResolvedTotal,
  qwenStrategyReviewBacklogSize,
  qwenStrategyReviewOldestPendingAgeSec,
  qwenAdminKillActionsTotal,
  qwenDrawdownPnlQueryErrorsTotal,
  qwenSignalsLoopRunsTotal,
  qwenSignalsLoopLastRunTs,
  qwenSignalsLoopJournalWriteErrorsTotal,
  failoverEventsTotal,
  providerErrorRate,
  slaComplianceTotal,
  httpRequestDuration,
  externalApiLatency,
  shardLatency,
  queueWaitTime,
} from '../prometheus-registry';

// --- Tests ---

describe('prometheus registry', () => {
  it('should export a valid prom-client Registry instance', () => {
    expect(register).toBeDefined();
    expect(typeof register.getMetricsAsJSON).toBe('function');
    expect(typeof register.metrics).toBe('function');
  });

  it('should collect default process metrics', async () => {
    const metricsJson = await register.getMetricsAsJSON();
    const metricNames = metricsJson.map((m) => m.name);

    const hasDefaultMetrics = metricNames.some(
      (n) => n.includes('process_cpu') || n.includes('nodejs_'),
    );
    expect(hasDefaultMetrics).toBe(true);
  });

  it('should serialize metrics to text format', async () => {
    const text = await register.metrics();
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });
});

describe('qwen signal pipeline gauges', () => {
  it('qwenPaperPnlPct -- should set and get gauge value', async () => {
    qwenPaperPnlPct.set(-0.035);
    const metrics = await register.getMetricsAsJSON();
    const gauge = metrics.find((m) => m.name === 'algo_trader_qwen_paper_pnl_pct');
    expect(gauge).toBeDefined();
    expect(gauge!.values[0].value).toBe(-0.035);
  });

  it('qwenStrategyReviewBacklogSize -- should set gauge', async () => {
    qwenStrategyReviewBacklogSize.set(12);
    const metrics = await register.getMetricsAsJSON();
    const gauge = metrics.find((m) => m.name === 'algo_trader_qwen_strategy_review_backlog_size');
    expect(gauge).toBeDefined();
    expect(gauge!.values[0].value).toBe(12);
  });

  it('qwenStrategyReviewOldestPendingAgeSec -- should set gauge', async () => {
    qwenStrategyReviewOldestPendingAgeSec.set(172800);
    const metrics = await register.getMetricsAsJSON();
    const gauge = metrics.find(
      (m) => m.name === 'algo_trader_qwen_strategy_review_oldest_pending_age_sec',
    );
    expect(gauge).toBeDefined();
    expect(gauge!.values[0].value).toBe(172800);
  });

  it('qwenSignalsLoopLastRunTs -- should set gauge', async () => {
    const now = Math.floor(Date.now() / 1000);
    qwenSignalsLoopLastRunTs.set(now);
    const metrics = await register.getMetricsAsJSON();
    const gauge = metrics.find(
      (m) => m.name === 'algo_trader_qwen_signals_loop_last_run_ts',
    );
    expect(gauge).toBeDefined();
    expect(gauge!.values[0].value).toBe(now);
  });
});

describe('qwen signal pipeline counters', () => {
  it('qwenSignalsTotal -- should increment counter with label', async () => {
    qwenSignalsTotal.inc({ result: "accepted" });
    const metrics = await register.getMetricsAsJSON();
    const counter = metrics.find((m) => m.name === 'algo_trader_qwen_signals_total');
    expect(counter).toBeDefined();
    const acceptedValue = counter!.values.find(
      (v) => (v.labels as Record<string, string>).result === 'accepted',
    );
    expect(acceptedValue).toBeDefined();
    expect(acceptedValue!.value).toBe(1);
  });

  it('qwenStrategyReviewsQueuedTotal -- should increment', async () => {
    qwenStrategyReviewsQueuedTotal.inc({ reason: "quality_drift" });
    const metrics = await register.getMetricsAsJSON();
    const counter = metrics.find(
      (m) => m.name === 'algo_trader_qwen_strategy_reviews_queued_total',
    );
    expect(counter).toBeDefined();
    expect(counter!.values[0].value).toBeGreaterThanOrEqual(1);
  });

  it('qwenStrategyReviewsResolvedTotal -- should increment', async () => {
    qwenStrategyReviewsResolvedTotal.inc({ reason: "operator_approved" });
    const metrics = await register.getMetricsAsJSON();
    const counter = metrics.find(
      (m) => m.name === 'algo_trader_qwen_strategy_reviews_resolved_total',
    );
    expect(counter).toBeDefined();
  });

  it('qwenAdminKillActionsTotal -- should increment with action label', async () => {
    qwenAdminKillActionsTotal.inc({ action: "kill" });
    qwenAdminKillActionsTotal.inc({ action: "unkill" });
    const metrics = await register.getMetricsAsJSON();
    const counter = metrics.find(
      (m) => m.name === 'algo_trader_qwen_admin_kill_actions_total',
    );
    expect(counter).toBeDefined();
    expect(counter!.values.length).toBe(2);
  });

  it('qwenDrawdownPnlQueryErrorsTotal -- should increment', async () => {
    qwenDrawdownPnlQueryErrorsTotal.inc();
    const metrics = await register.getMetricsAsJSON();
    const counter = metrics.find(
      (m) => m.name === 'algo_trader_qwen_drawdown_monitor_pnl_query_errors_total',
    );
    expect(counter).toBeDefined();
    expect(counter!.values[0].value).toBe(1);
  });

  it('qwenSignalsLoopRunsTotal -- should increment with decision label', async () => {
    qwenSignalsLoopRunsTotal.inc({ decision: "hold" });
    const metrics = await register.getMetricsAsJSON();
    const counter = metrics.find(
      (m) => m.name === 'algo_trader_qwen_signals_loop_runs_total',
    );
    expect(counter).toBeDefined();
  });

  it('qwenSignalsLoopJournalWriteErrorsTotal -- should increment', async () => {
    qwenSignalsLoopJournalWriteErrorsTotal.inc();
    const metrics = await register.getMetricsAsJSON();
    const counter = metrics.find(
      (m) => m.name === 'algo_trader_qwen_signals_loop_journal_write_errors_total',
    );
    expect(counter).toBeDefined();
  });
});

describe('Provider / SLA counters', () => {
  it('failoverEventsTotal -- should increment with provider and direction', async () => {
    failoverEventsTotal.inc({ provider: 'binance', direction: 'buy' });
    failoverEventsTotal.inc({ provider: 'binance', direction: 'buy' });
    failoverEventsTotal.inc({ provider: 'okx', direction: 'sell' });
    const metrics = await register.getMetricsAsJSON();
    const counter = metrics.find((m) => m.name === 'provider_failover_events_total');
    expect(counter).toBeDefined();
    expect(counter!.values.length).toBeGreaterThanOrEqual(2);
  });

  it('providerErrorRate -- should set gauge per provider', async () => {
    providerErrorRate.set({ provider: 'binance' }, 0.02);
    providerErrorRate.set({ provider: 'okx' }, 0.05);
    const metrics = await register.getMetricsAsJSON();
    const gauge = metrics.find((m) => m.name === 'provider_error_rate');
    expect(gauge).toBeDefined();
    expect(gauge!.values.length).toBe(2);
  });

  it('slaComplianceTotal -- should increment with provider and result', async () => {
    slaComplianceTotal.inc({ provider: 'binance', result: 'pass' });
    const metrics = await register.getMetricsAsJSON();
    const counter = metrics.find((m) => m.name === 'sla_compliance_total');
    expect(counter).toBeDefined();
    expect(counter!.values[0].value).toBe(1);
  });
});

describe('Latency monitoring histograms', () => {
  it('httpRequestDuration -- should observe values and produce count', async () => {
    httpRequestDuration.observe({ method: 'GET', route: '/api/v1/signals', region: 'us-east', status: '200' }, 0.045);
    httpRequestDuration.observe({ method: 'GET', route: '/api/v1/signals', region: 'us-east', status: '200' }, 0.12);
    const metrics = await register.getMetricsAsJSON();
    const histogram = metrics.find((m) => m.name === 'http_request_duration_seconds');
    expect(histogram).toBeDefined();
    expect(histogram!.values.length).toBeGreaterThan(0);
    const countEntry = histogram!.values.find((v) => v.metricName?.endsWith('_count'));
    expect(countEntry).toBeDefined();
    expect(countEntry!.value).toBe(2);
  });

  it('externalApiLatency -- should observe values', async () => {
    externalApiLatency.observe({ service: 'polymarket', endpoint: '/prices', region: 'us-east' }, 0.08);
    const metrics = await register.getMetricsAsJSON();
    const histogram = metrics.find((m) => m.name === 'external_api_latency_seconds');
    expect(histogram).toBeDefined();
    const countEntry = histogram!.values.find((v) => v.metricName?.endsWith('_count'));
    expect(countEntry).toBeDefined();
    expect(countEntry!.value).toBe(1);
  });

  it('shardLatency -- should observe values', async () => {
    shardLatency.observe({ shard_id: 'shard-0', operation: 'read' }, 0.003);
    const metrics = await register.getMetricsAsJSON();
    const histogram = metrics.find((m) => m.name === 'shard_latency_seconds');
    expect(histogram).toBeDefined();
    const countEntry = histogram!.values.find((v) => v.metricName?.endsWith('_count'));
    expect(countEntry).toBeDefined();
    expect(countEntry!.value).toBe(1);
  });

  it('queueWaitTime -- should observe values', async () => {
    queueWaitTime.observe({ priority: 'high', agent: 'kelly-sizer', tier: 'PREMIUM' }, 0.025);
    const metrics = await register.getMetricsAsJSON();
    const histogram = metrics.find((m) => m.name === 'queue_wait_seconds');
    expect(histogram).toBeDefined();
    const countEntry = histogram!.values.find((v) => v.metricName?.endsWith('_count'));
    expect(countEntry).toBeDefined();
    expect(countEntry!.value).toBe(1);
  });
});
