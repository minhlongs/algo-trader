/**
 * Worker health-route contract.
 *
 * `/api/health` is an alias for `/health`: the SHA deploy verifier and the root
 * handler both advertise the /api-prefixed form, so it must never fall through
 * to notImplementedResponse (501).
 */

import { describe, it, expect } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import worker from '../edge-proxy';
import type { Env } from '../edge-proxy-types';

function makeEnv(): Env {
  return {
    CACHE: { get: async () => null, put: async () => undefined, delete: async () => {} } as unknown as KVNamespace,
    ENVIRONMENT: 'test',
    REGION_ROUTING_ENABLED: 'false',
  } as unknown as Env;
}

const get = (path: string) => new Request(`https://api.cashclaw.cc${path}`);

describe('Worker health route', () => {
  it('serves /health with 200 and a status field', async () => {
    const res = await worker.fetch(get('/health'), makeEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe('ok');
  });

  it('serves /api/health identically to /health', async () => {
    const bare = await worker.fetch(get('/health'), makeEnv());
    const aliased = await worker.fetch(get('/api/health'), makeEnv());
    expect(aliased.status).toBe(200);
    expect(await aliased.json()).toEqual(await bare.json());
  });

  it('does not 501 on the aliased path (regression: deploy verifier probes /api/health)', async () => {
    const res = await worker.fetch(get('/api/health'), makeEnv());
    expect(res.status).not.toBe(501);
  });

  it('rejects non-GET methods on the aliased health path', async () => {
    const res = await worker.fetch(new Request('https://api.cashclaw.cc/api/health', { method: 'POST' }), makeEnv());
    // POST on a GET-only route must not be served as a health check.
    expect(res.status).not.toBe(200);
  });

  it('exposes no secret-bearing fields in the health payload', async () => {
    const res = await worker.fetch(get('/api/health'), makeEnv());
    const raw = JSON.stringify(await res.json());
    // Bindings are reported as a configured/missing flag, never as their values.
    expect(raw).not.toMatch(/NOWPAYMENTS_API_KEY|SUBSCRIBERS|METRIC_PASSWORD/);
  });
});
