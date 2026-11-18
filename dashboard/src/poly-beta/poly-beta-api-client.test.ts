import { afterEach, describe, expect, it, vi } from 'vitest';
import { BETA_REQUEST_TIMEOUT_MS, betaRequest, setCsrfToken } from './poly-beta-api-client';

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  globalThis.fetch = originalFetch;
  setCsrfToken('');
});

describe('betaRequest transport hardening', () => {
  it('aborts a stalled request and returns a timeout response', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })));

    const pending = betaRequest<{ ok?: boolean }>('/api/beta/portfolio');
    await vi.advanceTimersByTimeAsync(BETA_REQUEST_TIMEOUT_MS + 1);

    await expect(pending).resolves.toEqual({
      status: 0,
      data: expect.objectContaining({ code: 'NETWORK_TIMEOUT' }),
    });
  });

  it('maps a transport failure to a retryable network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    await expect(betaRequest('/api/beta/portfolio')).resolves.toEqual({
      status: 0,
      data: expect.objectContaining({ code: 'NETWORK_ERROR' }),
    });
  });

  it('keeps the HTTP status when the body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not-json', { status: 401 })));
    const res = await betaRequest('/api/beta/portfolio');
    expect(res.status).toBe(401);
    expect(res.data.code).toBe('INVALID_RESPONSE');
  });

  it('rejects scalar and array payloads instead of exposing them as data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[1,2,3]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));
    const res = await betaRequest('/api/beta/portfolio');
    expect(res.status).toBe(200);
    expect(res.data.code).toBe('INVALID_RESPONSE');
  });

  it('returns the parsed object envelope for a successful response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ ok: true, tenantId: 'tenant-1' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )));
    const res = await betaRequest<{ ok?: boolean; tenantId?: string }>('/api/beta/portfolio');
    expect(res.status).toBe(200);
    expect(res.data.ok).toBe(true);
    expect(res.data.tenantId).toBe('tenant-1');
  });
});
