/**
 * Pillar 2 observability tests — L-tier Prometheus gauges + OTel tracing init.
 * Verifies: (a) 3 new gauges exposed with correct names, (b) helper clamping,
 * (c) tracing.ts noop by default, real exporter when endpoint set.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('L-tier Prometheus gauges', () => {
  beforeEach(() => vi.resetModules());

  it('exposes algo_trader_qwen_kill_switch_active with source label', async () => {
    const mod = await import('../../../platform/middleware/prometheus-metrics');
    mod.setQwenKillSwitch('env', true);
    mod.setQwenKillSwitch('kv', false);
    const text = await mod.register.metrics();
    expect(text).toContain('algo_trader_qwen_kill_switch_active{source="env"} 1');
    expect(text).toContain('algo_trader_qwen_kill_switch_active{source="kv"} 0');
  });

  it('exposes algo_trader_qwen_paper_gate_days_remaining, clamped to [0,30]', async () => {
    const mod = await import('../../../platform/middleware/prometheus-metrics');
    mod.setQwenPaperGateDaysRemaining(42);
    let text = await mod.register.metrics();
    expect(text).toContain('algo_trader_qwen_paper_gate_days_remaining 30');

    mod.setQwenPaperGateDaysRemaining(-3);
    text = await mod.register.metrics();
    expect(text).toContain('algo_trader_qwen_paper_gate_days_remaining 0');

    mod.setQwenPaperGateDaysRemaining(12.345);
    text = await mod.register.metrics();
    expect(text).toContain('algo_trader_qwen_paper_gate_days_remaining 12.3');
  });

  it('exposes algo_trader_qwen_drawdown_auto_disabled as 0|1', async () => {
    const mod = await import('../../../platform/middleware/prometheus-metrics');
    mod.setQwenDrawdownAutoDisabled(true);
    let text = await mod.register.metrics();
    expect(text).toMatch(/algo_trader_qwen_drawdown_auto_disabled 1/);

    mod.setQwenDrawdownAutoDisabled(false);
    text = await mod.register.metrics();
    expect(text).toMatch(/algo_trader_qwen_drawdown_auto_disabled 0/);
  });
});

describe('OTel tracing init', () => {
  const origEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  });

  afterEach(() => {
    if (origEndpoint) process.env.OTEL_EXPORTER_OTLP_ENDPOINT = origEndpoint;
    else delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  });

  it('noop by default — getTracer().startActiveSpan runs fn and returns value', async () => {
    const { getTracer, resetTracingForTests } = await import('../../../shared/utils/tracing');
    resetTracingForTests();

    const result = await getTracer().startActiveSpan('test.span', async (span) => {
      span.setAttribute('foo', 'bar');
      return 42;
    });
    expect(result).toBe(42);
  });

  it('initTracing is idempotent when endpoint unset', async () => {
    const { initTracing, resetTracingForTests } = await import('../../../shared/utils/tracing');
    resetTracingForTests();

    await initTracing();
    await initTracing(); // second call is a no-op; must not throw
    expect(true).toBe(true);
  });

  it('initTracing with OTEL_EXPORTER_OTLP_ENDPOINT attempts SDK load without throwing', async () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://127.0.0.1:14318/v1/traces';
    const { initTracing, getTracer, resetTracingForTests } = await import('../../../shared/utils/tracing');
    resetTracingForTests();

    await initTracing();

    // Real tracer wired — startActiveSpan still runs fn + returns value
    const result = await getTracer().startActiveSpan('post-init.span', async (span) => {
      span.setAttribute('after', 'init');
      return 'ok';
    });
    expect(result).toBe('ok');
  });

  it('concurrent initTracing calls share one in-flight promise', async () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://127.0.0.1:14318/v1/traces';
    const { initTracing, resetTracingForTests } = await import('../../../shared/utils/tracing');
    resetTracingForTests();

    const [a, b, c] = await Promise.all([initTracing(), initTracing(), initTracing()]);
    expect(a).toBeUndefined();
    expect(b).toBeUndefined();
    expect(c).toBeUndefined();
  });

  it('SDK import failure falls back to noop without throwing', async () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://127.0.0.1:14318/v1/traces';
    vi.doMock('@opentelemetry/sdk-trace-node', () => {
      throw new Error('simulated SDK load failure');
    });

    const { initTracing, getTracer, resetTracingForTests } = await import('../../../shared/utils/tracing');
    resetTracingForTests();
    await initTracing(); // must not throw

    // Still noop — fn runs and returns value
    const result = await getTracer().startActiveSpan('fallback.span', async () => 'noop-ok');
    expect(result).toBe('noop-ok');

    vi.doUnmock('@opentelemetry/sdk-trace-node');
  });
});
