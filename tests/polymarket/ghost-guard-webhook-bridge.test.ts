import { describe, it, expect } from 'vitest';
import { createPolyKillSwitch } from '../../src/desk/risk/poly-kill-switch';
import { createEmptyGhostGuardStats } from '../../src/desk/polymarket/ghost-guard-types';
import {
  handleGhostGuardPayload,
  startGhostGuardWebhookServer,
} from '../../src/desk/polymarket/ghost-guard-webhook-bridge';
import {
  KNOWN_GHOST_COUNTERPARTY,
  KNOWN_GHOST_FILL_TX_HASH,
  runKnownGhostFillDrill,
} from '../../src/desk/polymarket/ghost-guard-drill-rpc';
import {
  cmdCaptureSample,
  cmdDrillGhost,
  getActiveManagedPids,
  runBoundedProcess,
} from '../../scripts/poly-sidecars';

const SAMPLE_REAL_TX = `0x${'ab'.repeat(32)}`;
const SAMPLE_TIMEOUT_TX = `0x${'cd'.repeat(32)}`;

describe('GhostGuard webhook bridge + kill-switch fuse + mock RPC drill', () => {
  it('increments verified count on FillVerdict::Real without firing kill switch', async () => {
    let cancelCalls = 0;
    const killSwitch = createPolyKillSwitch({
      cancelAll: async () => {
        cancelCalls += 1;
        return { ok: true, status: 200 };
      },
    });
    const stats = createEmptyGhostGuardStats();

    const res = await handleGhostGuardPayload(
      { verdict: 'Real', tx_hash: SAMPLE_REAL_TX, block: 61_000_000 },
      killSwitch,
      { stats },
    );

    expect(res.ok).toBe(true);
    expect(res.kind).toBe('Real');
    expect(res.latched).toBe(false);
    expect(res.issued).toBe(false);
    expect(killSwitch.isFired()).toBe(false);
    expect(cancelCalls).toBe(0);
    expect(stats.realVerdicts).toBe(1);
  });

  it('synchronously latches kill switch on FillVerdict::Ghost and records idempotent replay on GhostFillEvent', async () => {
    let cancelCalls = 0;
    let latchedBeforeTransportResolved = false;
    const alerts: string[] = [];

    const killSwitch = createPolyKillSwitch({
      cancelAll: async () => {
        cancelCalls += 1;
        latchedBeforeTransportResolved = killSwitch.isFired();
        return { ok: true, status: 200, body: '{"canceled":"all"}' };
      },
    });
    const stats = createEmptyGhostGuardStats();

    const first = await handleGhostGuardPayload(
      {
        verdict: 'Ghost',
        tx_hash: KNOWN_GHOST_FILL_TX_HASH,
        reason: 'TRANSFER_FROM_FAILED',
        counterparty: KNOWN_GHOST_COUNTERPARTY,
      },
      killSwitch,
      { stats, onGhostFill: (a) => alerts.push(a.fireReason) },
    );

    expect(latchedBeforeTransportResolved).toBe(true);
    expect(first.ok).toBe(true);
    expect(first.latched).toBe(true);
    expect(first.issued).toBe(true);
    expect(first.fireReason).toBe(
      `ghost-guard:Ghost:tx=${KNOWN_GHOST_FILL_TX_HASH}:reason=TRANSFER_FROM_FAILED`,
    );

    // GhostGuard sidecar follows FillVerdict::Ghost with GhostFillEvent on the same webhook
    const second = await handleGhostGuardPayload(
      {
        tx_hash: KNOWN_GHOST_FILL_TX_HASH,
        market: '0xmarket1',
        side: 'BUY',
        size: 250.5,
        price: 0.49,
        counterparty: KNOWN_GHOST_COUNTERPARTY,
        reason: 'TRANSFER_FROM_FAILED',
        timestamp: 1_700_000_000,
      },
      killSwitch,
      { stats, onGhostFill: (a) => alerts.push(a.fireReason) },
    );

    expect(second.ok).toBe(true);
    expect(second.latched).toBe(true);
    expect(second.issued).toBe(false);
    expect(cancelCalls).toBe(1);
    expect(stats.ghostVerdicts).toBe(1);
    expect(stats.ghostFillEvents).toBe(1);
    expect(stats.killSwitchFires).toBe(1);
    expect(stats.idempotentReplays).toBe(1);
    expect(alerts).toHaveLength(2);
    expect(killSwitch.getAudit().map((e) => e.kind)).toEqual(['fired', 'idempotent-replay']);
  });

  it('latches kill switch immediately on FillVerdict::Timeout and standalone GhostFillEvent', async () => {
    const killSwitch = createPolyKillSwitch({
      cancelAll: async () => ({ ok: true, status: 200 }),
    });

    const timeoutRes = await handleGhostGuardPayload(
      { verdict: 'Timeout', tx_hash: SAMPLE_TIMEOUT_TX },
      killSwitch,
    );
    expect(timeoutRes.latched).toBe(true);
    expect(timeoutRes.issued).toBe(true);
    expect(timeoutRes.fireReason).toBe(
      `ghost-guard:Timeout:tx=${SAMPLE_TIMEOUT_TX}:reason=timeout`,
    );

    killSwitch.reset();
    expect(killSwitch.isFired()).toBe(false);

    const eventRes = await handleGhostGuardPayload(
      {
        tx_hash: SAMPLE_TIMEOUT_TX,
        market: 'btc-updown-5m',
        side: 'SELL',
        size: 100,
        price: 0.52,
        counterparty: null,
        reason: 'timeout — no receipt',
        timestamp: 1_700_000_010,
      },
      killSwitch,
    );
    expect(eventRes.latched).toBe(true);
    expect(eventRes.issued).toBe(true);
    expect(eventRes.fireReason).toBe(
      `ghost-guard:GhostFillEvent:tx=${SAMPLE_TIMEOUT_TX}:reason=timeout — no receipt`,
    );
  });

  it('serves 127.0.0.1 loopback HTTP webhook, rejects malformed JSON with 400, enforces authToken, and latches in <100ms', async () => {
    const killSwitch = createPolyKillSwitch({
      cancelAll: async () => ({ ok: true, status: 200 }),
    });

    await expect(
      startGhostGuardWebhookServer({ host: '0.0.0.0', killSwitch }),
    ).rejects.toThrow(/non-loopback/);

    const server = await startGhostGuardWebhookServer({
      killSwitch,
      authToken: 'secret-sidecar-token',
    });

    try {
      expect(server.host).toBe('127.0.0.1');

      // Unauthorized -> 401
      const unauthResp = await fetch(server.url, {
        method: 'POST',
        body: '{}',
      });
      expect(unauthResp.status).toBe(401);

      // Malformed JSON -> 400 without crashing server
      const badJsonResp = await fetch(server.url, {
        method: 'POST',
        headers: { authorization: 'Bearer secret-sidecar-token' },
        body: '{not-valid-json',
      });
      expect(badJsonResp.status).toBe(400);
      expect(killSwitch.isFired()).toBe(false);

      // Schema-invalid JSON -> 400
      const badSchemaResp = await fetch(server.url, {
        method: 'POST',
        headers: { authorization: 'Bearer secret-sidecar-token' },
        body: JSON.stringify({ verdict: 'Unknown', tx_hash: '0x123' }),
      });
      expect(badSchemaResp.status).toBe(400);

      // Valid FillVerdict::Ghost over loopback HTTP -> latches in < 100ms
      const t0 = performance.now();
      const ghostResp = await fetch(server.url, {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-sidecar-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          verdict: 'Ghost',
          tx_hash: KNOWN_GHOST_FILL_TX_HASH,
          reason: 'TRANSFER_FROM_FAILED',
          counterparty: KNOWN_GHOST_COUNTERPARTY,
        }),
      });
      const roundtripMs = performance.now() - t0;
      const body = (await ghostResp.json()) as { latched: boolean; latencyMs: number };

      expect(ghostResp.status).toBe(200);
      expect(body.latched).toBe(true);
      expect(killSwitch.isFired()).toBe(true);
      expect(roundtripMs).toBeLessThan(100);
      expect(server.getStats().unauthorizedRequests).toBe(1);
      expect(server.getStats().invalidPayloads).toBe(2);
      expect(server.getStats().killSwitchFires).toBe(1);
    } finally {
      await server.close();
    }
  });

  it('executes deterministic offline status=0 TRANSFER_FROM_FAILED JSON-RPC drill and cleans up sidecar processes', async () => {
    const killSwitch = createPolyKillSwitch({
      cancelAll: async () => ({ ok: true, status: 200 }),
    });

    const drill = await runKnownGhostFillDrill(killSwitch);
    expect(drill.verdict).toEqual({
      verdict: 'Ghost',
      tx_hash: KNOWN_GHOST_FILL_TX_HASH,
      reason: 'TRANSFER_FROM_FAILED',
      counterparty: KNOWN_GHOST_COUNTERPARTY,
    });
    expect(drill.webhookResult.latched).toBe(true);
    expect(killSwitch.isFired()).toBe(true);
    expect(drill.elapsedMs).toBeLessThan(1_000);
    expect(drill.rpcCalls.eth_chainId).toBe(1);
    expect(drill.rpcCalls.eth_getTransactionReceipt).toBe(1);
    expect(drill.rpcCalls.eth_getTransactionByHash).toBe(1);
    expect(drill.rpcCalls.eth_call).toBe(1);

    // Verify bounded process runner SIGTERM teardown leaves zero active child PIDs
    const bounded = await runBoundedProcess(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000);'],
      { timeoutMs: 120, graceMs: 300 },
    );
    expect(bounded.timedOut).toBe(true);
    expect(getActiveManagedPids()).toEqual([]);

    const cliDrill = await cmdDrillGhost();
    expect(cliDrill.ok).toBe(true);
    expect(cliDrill.activeManagedPids).toEqual([]);

    const cliSample = await cmdCaptureSample({ durationMs: 250 });
    expect(cliSample.ok).toBe(true);
    expect(cliSample.activeManagedPids).toEqual([]);
  });
});
