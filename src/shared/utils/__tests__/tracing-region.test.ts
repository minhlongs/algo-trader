/**
 * Tracing region attribute unit tests
 *
 * Exercises src/shared/utils/tracing.ts with OTEL initialized — covers
 * REGION env var, ENVIRONMENT env var, and cf-colo header resolution
 * in withRegionAttributes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSpan = {
  end: vi.fn(),
  setAttribute: vi.fn(),
  recordException: vi.fn(),
};

const mockTracer = {
  startActiveSpan: vi.fn(),
  startSpan: vi.fn(() => mockSpan),
};

const mockOTelApi = {
  trace: {
    getTracer: vi.fn(() => mockTracer),
    getActiveSpan: vi.fn(),
  },
};

class FakeProvider {
  register = vi.fn();
}

vi.mock('@opentelemetry/api', () => mockOTelApi);
vi.mock('@opentelemetry/sdk-trace-node', () => ({
  NodeTracerProvider: FakeProvider,
  BatchSpanProcessor: vi.fn(),
}));
vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: vi.fn(),
}));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  initTracing,
  resetTracingForTests,
  withRegionAttributes,
} from '../tracing';

describe('tracing — region attributes', () => {
  const originalEnv = { ...process.env };
  const originalGlobalRequest = (globalThis as { request?: unknown }).request;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockTracer.startSpan.mockReturnValue(mockSpan);
    mockOTelApi.trace.getTracer.mockReturnValue(mockTracer);
    process.env = { ...originalEnv };
    delete process.env.REGION;
    delete process.env.ENVIRONMENT;
    (globalThis as { request?: unknown }).request = undefined;
    resetTracingForTests();
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318/v1/traces';
    await initTracing();
  });

  afterEach(() => {
    process.env = originalEnv;
    (globalThis as { request?: unknown }).request = originalGlobalRequest;
    resetTracingForTests();
  });

  it('invokes callback and returns its result', async () => {
    const result = await withRegionAttributes(async () => 'done');
    expect(result).toBe('done');
  });

  it('sets cloud.region attribute using REGION env var', async () => {
    process.env.REGION = 'SFO';
    await withRegionAttributes(async () => {});
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('cloud.region', 'SFO');
  });

  it('falls back to unknown when REGION is unset', async () => {
    delete process.env.REGION;
    await withRegionAttributes(async () => {});
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('cloud.region', 'unknown');
  });

  it('sets deployment.environment attribute', async () => {
    process.env.ENVIRONMENT = 'production';
    await withRegionAttributes(async () => {});
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('deployment.environment', 'production');
  });

  it('falls back to development when ENVIRONMENT is unset', async () => {
    delete process.env.ENVIRONMENT;
    await withRegionAttributes(async () => {});
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('deployment.environment', 'development');
  });

  it('reads cf-colo header from globalThis.request when available', async () => {
    (globalThis as { request?: unknown }).request = {
      headers: {
        get: (name: string) => (name === 'cf-colo' ? 'SIN' : null),
      },
    };
    await withRegionAttributes(async () => {});
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('cloud.region', 'SIN');
  });

  it('prefers cf-colo header over REGION env var', async () => {
    process.env.REGION = 'SFO';
    (globalThis as { request?: unknown }).request = {
      headers: {
        get: (name: string) => (name === 'cf-colo' ? 'SIN' : null),
      },
    };
    await withRegionAttributes(async () => {});
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('cloud.region', 'SIN');
  });
});
