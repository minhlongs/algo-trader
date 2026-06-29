import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ironclawFetch, DlpBlockedError } from '../ironclaw-fetch-proxy';
import { DlpPatternRegistry, DEFAULT_PATTERNS } from '../dlp-pattern-registry';
import { DlpOutboundRecorder, type AuditStore } from '../../../platform/audit/dlp-outbound-recorder';
import { CHAIN_GENESIS } from '../../../platform/audit/dlp-hash-chain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRegistry(extraPatterns = DEFAULT_PATTERNS) {
  const store = {
    query: async () => ({ results: [] }),
  };
  const reg = new DlpPatternRegistry(store);
  reg.seed(extraPatterns);
  return reg;
}

function makeRecorder() {
  const rows: unknown[] = [];
  const store: AuditStore = {
    run: async (_sql, ...params) => { rows.push(params); return {}; },
    query: async () => ({ results: [{ row_hash: CHAIN_GENESIS }] }),
  };
  const recorder = new DlpOutboundRecorder(store);
  return { recorder, rows };
}

function mockFetch(status = 200, body = '{"ok":true}') {
  return vi.fn(async () => new Response(body, { status }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ironclawFetch — allow', () => {
  it('passes clean request through unmodified', async () => {
    const { recorder } = makeRecorder();
    const registry = makeRegistry();
    const fetchFn = mockFetch();

    const res = await ironclawFetch(
      'https://api.example.com/data',
      { method: 'GET' },
      { subscriberId: 'sub-1', registry, recorder, fetchFn },
    );

    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledOnce();
    const [calledUrl] = fetchFn.mock.calls[0];
    expect(calledUrl).toBe('https://api.example.com/data');
  });
});

describe('ironclawFetch — block', () => {
  it('throws DlpBlockedError when body contains sk- key', async () => {
    const { recorder } = makeRecorder();
    const registry = makeRegistry();
    const fetchFn = mockFetch();

    await expect(
      ironclawFetch(
        'https://api.example.com/trade',
        { method: 'POST', body: JSON.stringify({ key: 'sk-abc123XYZ789abcdefghij' }) },
        { subscriberId: 'sub-1', registry, recorder, fetchFn },
      ),
    ).rejects.toThrow(DlpBlockedError);

    // fetch should NOT have been called
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('throws DlpBlockedError for Ethereum private key', async () => {
    const ethKey = '0x' + 'a'.repeat(64);
    const { recorder } = makeRecorder();
    const registry = makeRegistry();

    await expect(
      ironclawFetch(
        'https://api.example.com/',
        { method: 'POST', body: `{"key":"${ethKey}"}` },
        { subscriberId: 'sub-1', registry, recorder, fetchFn: mockFetch() },
      ),
    ).rejects.toThrow(DlpBlockedError);
  });
});

describe('ironclawFetch — redact', () => {
  it('redacts email from body before forwarding', async () => {
    const { recorder } = makeRecorder();
    const registry = makeRegistry();
    const fetchFn = mockFetch();

    await ironclawFetch(
      'https://api.example.com/notify',
      { method: 'POST', body: 'send to user@example.com please' },
      { subscriberId: 'sub-1', registry, recorder, fetchFn },
    );

    expect(fetchFn).toHaveBeenCalledOnce();
    const [, calledInit] = fetchFn.mock.calls[0] as [unknown, RequestInit];
    expect(calledInit.body as string).toContain('[REDACTED:p-email]');
    expect(calledInit.body as string).not.toContain('user@example.com');
  });

  it('redacts pk- key from body', async () => {
    const { recorder } = makeRecorder();
    const registry = makeRegistry();
    const fetchFn = mockFetch();

    const body = 'api_key=pk-ABCDEFGHIJKLMNOPQRSTUVWX';
    await ironclawFetch(
      'https://api.example.com/',
      { method: 'POST', body },
      { subscriberId: 'sub-1', registry, recorder, fetchFn },
    );

    const [, calledInit] = fetchFn.mock.calls[0] as [unknown, RequestInit];
    expect(calledInit.body as string).toContain('[REDACTED:p-pk]');
  });
});

describe('ironclawFetch — alert emission', () => {
  it('fires alert webhook on alert-action pattern without blocking', async () => {
    const { recorder } = makeRecorder();
    const alertPattern = {
      ...DEFAULT_PATTERNS[0],
      id: 'p-alert-test',
      pattern: 'ALERT_TRIGGER',
      action: 'alert' as const,
      scope: 'body' as const,
    };
    const registry = makeRegistry([alertPattern]);
    const fetchFn = mockFetch();
    const alertFetch = vi.fn(async () => new Response('ok', { status: 200 }));

    const res = await ironclawFetch(
      'https://api.example.com/',
      { method: 'POST', body: 'payload with ALERT_TRIGGER inside' },
      {
        subscriberId: 'sub-1',
        registry,
        recorder,
        fetchFn,
        alert: { webhookUrl: 'https://hooks.example.com/dlp', hmacSecret: 'secret', fetchFn: alertFetch },
      },
    );

    // Request passes through
    expect(res.status).toBe(200);
    // Alert fired (async — wait a tick)
    await new Promise(r => setTimeout(r, 10));
    expect(alertFetch).toHaveBeenCalledOnce();
    const [alertUrl, alertInit] = alertFetch.mock.calls[0] as [string, RequestInit];
    expect(alertUrl).toBe('https://hooks.example.com/dlp');
    const payload = JSON.parse(alertInit.body as string);
    expect(payload.eventType).toBe('alert');
    expect(payload.patternId).toBe('p-alert-test');
  });
});

describe('ironclawFetch — no patterns', () => {
  it('allows all traffic when registry is empty', async () => {
    const { recorder } = makeRecorder();
    const registry = makeRegistry([]);
    const fetchFn = mockFetch();

    const res = await ironclawFetch(
      'https://api.example.com/',
      { method: 'GET' },
      { subscriberId: 'sub-1', registry, recorder, fetchFn },
    );
    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledOnce();
  });
});
