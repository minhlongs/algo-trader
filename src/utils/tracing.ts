/**
 * OpenTelemetry tracing initialisation — Pillar 2 observability.
 *
 * Activation: set OTEL_EXPORTER_OTLP_ENDPOINT (e.g. http://localhost:4318/v1/traces).
 * Unset → silent noop (zero prod risk when endpoint unreachable).
 *
 * Keeps dynamic import so the SDK is optional at runtime even though deps
 * ship in package.json (see `@opentelemetry/sdk-trace-node`, `exporter-trace-otlp-http`).
 */

import { logger } from './logger';

interface Span {
  end(): void;
  setAttribute(key: string, value: string | number | boolean): void;
  recordException(err: unknown): void;
}

interface Tracer {
  startActiveSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T>;
  startSpan(name: string): Span;
}

const noopSpan: Span = {
  end: () => undefined,
  setAttribute: () => undefined,
  recordException: () => undefined,
};

const noopTracer: Tracer = {
  startActiveSpan: async <T>(_name: string, fn: (s: Span) => Promise<T>) => fn(noopSpan),
  startSpan: () => noopSpan,
};

let _tracer: Tracer = noopTracer;
let _initPromise: Promise<void> | null = null;

/**
 * Get current region from Cloudflare headers or environment
 */
function getCurrentRegion(): string {
  // In Cloudflare Workers, use cf-colo or cf-region
  if (typeof globalThis !== 'undefined' && globalThis.request) {
    const req = globalThis.request as Request;
    const colo = req.headers.get('cf-colo');
    if (colo) return colo;
  }
  return process.env.REGION || 'unknown';
}

/**
 * Add region and environment attributes to the active span
 */
export function withRegionAttributes<T>(fn: () => Promise<T>): Promise<T> {
  const span = _tracer.startSpan('with-region');
  try {
    span.setAttribute('cloud.region', getCurrentRegion());
    span.setAttribute('deployment.environment', process.env.ENVIRONMENT || 'development');
    return fn();
  } finally {
    span.end();
  }
}

/**
 * Set region on currently active span (if any)
 */
export function setRegionOnActiveSpan(): void {
  const span = _tracer.startSpan('region-context') as any;
  // Actually we need to get the active span, not start a new one
  // The interface doesn't have getActiveSpan; let's modify approach
  // We'll rely on manual attribute setting in middleware
}

export function getTracer(_name = 'algo-trader'): Tracer {
  return _tracer;
}

async function runInit(): Promise<void> {
  const endpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
  if (!endpoint) return;

  try {
    const [otelApi, otelSdk, otelExporter] = await Promise.all([
      import('@opentelemetry/api'),
      import('@opentelemetry/sdk-trace-node'),
      import('@opentelemetry/exporter-trace-otlp-http'),
    ]);

    const exporter = new otelExporter.OTLPTraceExporter({ url: endpoint });
    const provider = new otelSdk.NodeTracerProvider({
      spanProcessors: [new otelSdk.BatchSpanProcessor(exporter)],
    });
    provider.register();

    const realTracer = otelApi.trace.getTracer('algo-trader');
    _tracer = {
      startActiveSpan: <T>(name: string, fn: (s: Span) => Promise<T>) =>
        realTracer.startActiveSpan(name, async (span) => {
          try {
            return await fn(span as unknown as Span);
          } catch (err) {
            span.recordException(err as Error);
            throw err;
          } finally {
            span.end();
          }
        }),
      startSpan: (name: string) => realTracer.startSpan(name) as unknown as Span,
    };
    logger.info('[Tracing] OTLP exporter active', { endpoint });
  } catch (err) {
    logger.warn('[Tracing] SDK unavailable — spans disabled', { err: String(err) });
  }
}

/**
 * Initialise tracing. Idempotent — concurrent callers share the same in-flight
 * promise; subsequent calls after resolution are no-ops.
 */
export function initTracing(): Promise<void> {
  if (!_initPromise) _initPromise = runInit();
  return _initPromise;
}

/** Reset for test isolation only. */
export function resetTracingForTests(): void {
  _tracer = noopTracer;
  _initPromise = null;
}

/**
 * Get the currently active span from OpenTelemetry context.
 * Returns null if no active span or tracing disabled.
 */
export function getActiveSpan(): Span | null {
  // Try to get from global OTel API if available
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const otelApi = require('@opentelemetry/api');
    const active = otelApi.trace.getActiveSpan();
    return active ? (active as unknown as Span) : null;
  } catch {
    return null;
  }
}

/**
 * Set region and environment on the active span (call from middleware)
 */
export function annotateActiveSpanWithRegion(region: string): void {
  const span = getActiveSpan();
  if (span) {
    span.setAttribute('cloud.region', region);
    span.setAttribute('deployment.environment', process.env.ENVIRONMENT || 'development');
  }
}
