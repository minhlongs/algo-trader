/**
 * Pure span and trace-context attribute helpers for OpenTelemetry tracing.
 */

export interface Span {
  end(): void;
  setAttribute(key: string, value: string | number | boolean): void;
  recordException(err: unknown): void;
}

export interface Tracer {
  startActiveSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T>;
  startSpan(name: string): Span;
}

export const noopSpan: Span = {
  end: () => undefined,
  setAttribute: () => undefined,
  recordException: () => undefined,
};

export const noopTracer: Tracer = {
  startActiveSpan: async <T>(_name: string, fn: (s: Span) => Promise<T>) => fn(noopSpan),
  startSpan: () => noopSpan,
};

/**
 * Get current region from Cloudflare headers or environment
 */
export function getCurrentRegion(): string {
  const globalWithReq = globalThis as typeof globalThis & { request?: Request };
  const globalRequest = globalWithReq.request;
  if (globalRequest?.headers) {
    const colo = globalRequest.headers.get('cf-colo');
    if (colo) return colo;
  }
  return process.env.REGION || 'unknown';
}

/**
 * Apply region and deployment environment attributes to a span
 */
export function applyRegionAttributes(span: Span, region = getCurrentRegion()): void {
  span.setAttribute('cloud.region', region);
  span.setAttribute('deployment.environment', process.env.ENVIRONMENT || 'development');
}

/**
 * Resolve active span from initialized OTel API or global symbol registry
 */
export function resolveActiveSpan(otelApi: typeof import('@opentelemetry/api') | null): Span | null {
  try {
    if (otelApi?.trace) {
      const active = otelApi.trace.getActiveSpan();
      return active ? (active as unknown as Span) : null;
    }
    const globalOtel = (globalThis as unknown as Record<symbol, typeof import('@opentelemetry/api')>)[
      Symbol.for('opentelemetry.js.api.1')
    ];
    if (globalOtel?.trace) {
      const active = globalOtel.trace.getActiveSpan();
      return active ? (active as unknown as Span) : null;
    }
    return null;
  } catch {
    return null;
  }
}
