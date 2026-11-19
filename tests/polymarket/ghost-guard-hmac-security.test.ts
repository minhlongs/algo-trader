import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPolyKillSwitch } from '../../src/desk/risk/poly-kill-switch';
import {
  canonicalizeJson,
  signGhostGuardPayload,
} from '../../src/desk/polymarket/ghost-guard-auth';
import { startGhostGuardWebhookServer } from '../../src/desk/polymarket/ghost-guard-webhook-bridge';
import {
  KNOWN_GHOST_COUNTERPARTY,
  KNOWN_GHOST_FILL_TX_HASH,
} from '../../src/desk/polymarket/ghost-guard-drill-rpc';

const KEY_V1 = 'k1';
const SECRET_V1 = 'ghostguard-primary-secret-01';
const KEY_V2 = 'k2';
const SECRET_V2 = 'ghostguard-rotated-secret-02';
const SOURCE_ID = 'ghostguard-sidecar';
const ALT_TX_HASH = `0x${'ef'.repeat(32)}`;

function ghostVerdict(reason = 'TRANSFER_FROM_FAILED', txHash = KNOWN_GHOST_FILL_TX_HASH) {
  return {
    verdict: 'Ghost' as const,
    tx_hash: txHash,
    reason,
    counterparty: KNOWN_GHOST_COUNTERPARTY,
  };
}

describe('GhostGuard HMAC callback authentication & defense security', () => {
  it('1. accepts valid HMAC-SHA256 signed callback and synchronously latches kill switch', async () => {
    let cancelCalls = 0;
    const killSwitch = createPolyKillSwitch({
      cancelAll: async () => {
        cancelCalls += 1;
        return { ok: true, status: 200 };
      },
    });
    const now = 1_700_000_000_000;
    const server = await startGhostGuardWebhookServer({
      killSwitch,
      requireHmac: true,
      hmacAuth: {
        keyRing: { [KEY_V1]: SECRET_V1 },
        allowedSources: [SOURCE_ID],
        nowEpochMs: () => now,
      },
    });

    try {
      const payload = ghostVerdict();
      const signed = signGhostGuardPayload({
        secret: SECRET_V1,
        timestampMs: now,
        nonce: 'nonce-valid-001',
        sourceId: SOURCE_ID,
        keyId: KEY_V1,
        payload,
      });

      const resp = await fetch(server.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...signed.headers },
        body: signed.canonicalBody,
      });
      const body = (await resp.json()) as { ok: boolean; latched: boolean; issued: boolean };

      expect(resp.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.latched).toBe(true);
      expect(body.issued).toBe(true);
      expect(killSwitch.isFired()).toBe(true);
      expect(cancelCalls).toBe(1);
    } finally {
      await server.close();
    }
  });

  it('2. rejects modified payload with 401 and leaves kill switch untouched', async () => {
    const killSwitch = createPolyKillSwitch({
      cancelAll: async () => ({ ok: true, status: 200 }),
    });
    const now = 1_700_000_000_000;
    const server = await startGhostGuardWebhookServer({
      killSwitch,
      hmacAuth: {
        keyRing: { [KEY_V1]: SECRET_V1 },
        allowedSources: [SOURCE_ID],
        nowEpochMs: () => now,
      },
    });

    try {
      const original = ghostVerdict('TRANSFER_FROM_FAILED');
      const signed = signGhostGuardPayload({
        secret: SECRET_V1,
        timestampMs: now,
        nonce: 'nonce-tamper-001',
        sourceId: SOURCE_ID,
        keyId: KEY_V1,
        payload: original,
      });
      const modified = ghostVerdict('TAMPERED_REASON');

      const resp = await fetch(server.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...signed.headers },
        body: JSON.stringify(modified),
      });

      expect(resp.status).toBe(401);
      expect(killSwitch.isFired()).toBe(false);
      expect(server.getStats().unauthorizedRequests).toBe(1);
    } finally {
      await server.close();
    }
  });

  it('3. rejects wrong signing key and unknown key ID with 401 without mutating kill switch', async () => {
    const killSwitch = createPolyKillSwitch({
      cancelAll: async () => ({ ok: true, status: 200 }),
    });
    const now = 1_700_000_000_000;
    const server = await startGhostGuardWebhookServer({
      killSwitch,
      hmacAuth: {
        keyRing: { [KEY_V1]: SECRET_V1 },
        allowedSources: [SOURCE_ID],
        nowEpochMs: () => now,
      },
    });

    try {
      const payload = ghostVerdict();
      const wrongSecret = signGhostGuardPayload({
        secret: 'completely-wrong-secret',
        timestampMs: now,
        nonce: 'nonce-wrong-secret',
        sourceId: SOURCE_ID,
        keyId: KEY_V1,
        payload,
      });
      const r1 = await fetch(server.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...wrongSecret.headers },
        body: wrongSecret.canonicalBody,
      });
      expect(r1.status).toBe(401);

      const unknownKey = signGhostGuardPayload({
        secret: SECRET_V1,
        timestampMs: now,
        nonce: 'nonce-unknown-key',
        sourceId: SOURCE_ID,
        keyId: 'unknown-key-id',
        payload,
      });
      const r2 = await fetch(server.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...unknownKey.headers },
        body: unknownKey.canonicalBody,
      });
      expect(r2.status).toBe(401);
      expect(killSwitch.isFired()).toBe(false);
      expect(server.getStats().unauthorizedRequests).toBe(2);
    } finally {
      await server.close();
    }
  });

  it('4. rejects missing signature or missing auth headers with 401 and leaves kill switch untouched', async () => {
    const killSwitch = createPolyKillSwitch({
      cancelAll: async () => ({ ok: true, status: 200 }),
    });
    const now = 1_700_000_000_000;
    const server = await startGhostGuardWebhookServer({
      killSwitch,
      hmacAuth: {
        keyRing: { [KEY_V1]: SECRET_V1 },
        allowedSources: [SOURCE_ID],
        nowEpochMs: () => now,
      },
    });

    try {
      const payload = ghostVerdict();
      // Completely missing headers
      const r1 = await fetch(server.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(r1.status).toBe(401);

      // Missing only signature header
      const signed = signGhostGuardPayload({
        secret: SECRET_V1,
        timestampMs: now,
        nonce: 'nonce-missing-sig',
        sourceId: SOURCE_ID,
        keyId: KEY_V1,
        payload,
      });
      const { 'X-GhostGuard-Signature': _omitted, ...partialHeaders } = signed.headers;
      const r2 = await fetch(server.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...partialHeaders },
        body: signed.canonicalBody,
      });
      expect(r2.status).toBe(401);
      expect(killSwitch.isFired()).toBe(false);
      expect(server.getStats().unauthorizedRequests).toBe(2);
    } finally {
      await server.close();
    }
  });

  it('5. rejects replayed nonce with 401 and does not re-process or mutate state', async () => {
    let cancelCalls = 0;
    const killSwitch = createPolyKillSwitch({
      cancelAll: async () => {
        cancelCalls += 1;
        return { ok: true, status: 200 };
      },
    });
    const now = 1_700_000_000_000;
    const server = await startGhostGuardWebhookServer({
      killSwitch,
      hmacAuth: {
        keyRing: { [KEY_V1]: SECRET_V1 },
        allowedSources: [SOURCE_ID],
        nowEpochMs: () => now,
      },
    });

    try {
      // First: valid Real verdict uses nonce-replay-001 (kill switch stays unlatched)
      const realPayload = { verdict: 'Real' as const, tx_hash: ALT_TX_HASH, block: 61_000_001 };
      const signedReal = signGhostGuardPayload({
        secret: SECRET_V1,
        timestampMs: now,
        nonce: 'nonce-replay-001',
        sourceId: SOURCE_ID,
        keyId: KEY_V1,
        payload: realPayload,
      });
      const first = await fetch(server.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...signedReal.headers },
        body: signedReal.canonicalBody,
      });
      expect(first.status).toBe(200);
      expect(killSwitch.isFired()).toBe(false);

      // Replay exact same nonce with a Ghost verdict signed legitimately -> must be rejected 401
      const signedGhostSameNonce = signGhostGuardPayload({
        secret: SECRET_V1,
        timestampMs: now,
        nonce: 'nonce-replay-001',
        sourceId: SOURCE_ID,
        keyId: KEY_V1,
        payload: ghostVerdict(),
      });
      const replay = await fetch(server.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...signedGhostSameNonce.headers },
        body: signedGhostSameNonce.canonicalBody,
      });
      expect(replay.status).toBe(401);
      expect(killSwitch.isFired()).toBe(false);
      expect(cancelCalls).toBe(0);
      expect(server.getStats().replayRejections).toBe(1);
    } finally {
      await server.close();
    }
  });

  it('6. rejects expired and future-skewed timestamps with 401', async () => {
    const killSwitch = createPolyKillSwitch({
      cancelAll: async () => ({ ok: true, status: 200 }),
    });
    const now = 1_700_000_000_000;
    const server = await startGhostGuardWebhookServer({
      killSwitch,
      hmacAuth: {
        keyRing: { [KEY_V1]: SECRET_V1 },
        allowedSources: [SOURCE_ID],
        maxSkewMs: 30_000,
        nowEpochMs: () => now,
      },
    });

    try {
      const expired = signGhostGuardPayload({
        secret: SECRET_V1,
        timestampMs: now - 31_000,
        nonce: 'nonce-expired-001',
        sourceId: SOURCE_ID,
        keyId: KEY_V1,
        payload: ghostVerdict(),
      });
      const rExpired = await fetch(server.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...expired.headers },
        body: expired.canonicalBody,
      });
      expect(rExpired.status).toBe(401);

      const future = signGhostGuardPayload({
        secret: SECRET_V1,
        timestampMs: now + 31_000,
        nonce: 'nonce-future-001',
        sourceId: SOURCE_ID,
        keyId: KEY_V1,
        payload: ghostVerdict(),
      });
      const rFuture = await fetch(server.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...future.headers },
        body: future.canonicalBody,
      });
      expect(rFuture.status).toBe(401);
      expect(killSwitch.isFired()).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('7. rejects oversized request exceeding maxBodyBytes with 413 and fails closed', async () => {
    const killSwitch = createPolyKillSwitch({
      cancelAll: async () => ({ ok: true, status: 200 }),
    });
    const now = 1_700_000_000_000;
    const server = await startGhostGuardWebhookServer({
      killSwitch,
      maxBodyBytes: 1_024,
      hmacAuth: {
        keyRing: { [KEY_V1]: SECRET_V1 },
        allowedSources: [SOURCE_ID],
        nowEpochMs: () => now,
      },
    });

    try {
      const oversizedPayload = ghostVerdict('A'.repeat(2_048));
      const signed = signGhostGuardPayload({
        secret: SECRET_V1,
        timestampMs: now,
        nonce: 'nonce-oversized-001',
        sourceId: SOURCE_ID,
        keyId: KEY_V1,
        payload: oversizedPayload,
      });
      const resp = await fetch(server.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...signed.headers },
        body: signed.canonicalBody,
      }).catch(() => new Response(null, { status: 413 }));

      expect(resp.status).toBe(413);
      expect(killSwitch.isFired()).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('8. handles concurrent duplicate callbacks atomically: single accepted, duplicates rejected', async () => {
    let cancelCalls = 0;
    const killSwitch = createPolyKillSwitch({
      cancelAll: async () => {
        cancelCalls += 1;
        await new Promise((r) => setTimeout(r, 15));
        return { ok: true, status: 200 };
      },
    });
    const now = 1_700_000_000_000;
    const server = await startGhostGuardWebhookServer({
      killSwitch,
      hmacAuth: {
        keyRing: { [KEY_V1]: SECRET_V1 },
        allowedSources: [SOURCE_ID],
        nowEpochMs: () => now,
      },
    });

    try {
      const signed = signGhostGuardPayload({
        secret: SECRET_V1,
        timestampMs: now,
        nonce: 'nonce-concurrent-001',
        sourceId: SOURCE_ID,
        keyId: KEY_V1,
        payload: ghostVerdict(),
      });

      const responses = await Promise.all(
        Array.from({ length: 6 }, () =>
          fetch(server.url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...signed.headers },
            body: signed.canonicalBody,
          }),
        ),
      );
      const statuses = responses.map((r) => r.status).sort((a, b) => a - b);

      expect(statuses).toEqual([200, 401, 401, 401, 401, 401]);
      expect(killSwitch.isFired()).toBe(true);
      expect(cancelCalls).toBe(1);
      expect(server.getStats().killSwitchFires).toBe(1);
      expect(server.getStats().replayRejections).toBe(5);
    } finally {
      await server.close();
    }
  });

  it('9. preserves kill-switch latch across restart and accepts key-rotated callbacks', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'ghostguard-latch-'));
    const latchStatePath = join(tempDir, 'kill-switch-latch.json');
    const now = 1_700_000_000_000;

    try {
      // Phase A: first server latches kill switch using KEY_V1 and persists snapshot
      const ks1 = createPolyKillSwitch({
        cancelAll: async () => ({ ok: true, status: 200 }),
      });
      const srv1 = await startGhostGuardWebhookServer({
        killSwitch: ks1,
        latchStatePath,
        requireHmac: true,
        hmacAuth: {
          keyRing: { [KEY_V1]: SECRET_V1 },
          allowedSources: [SOURCE_ID],
          nowEpochMs: () => now,
        },
      });
      try {
        const signedV1 = signGhostGuardPayload({
          secret: SECRET_V1,
          timestampMs: now,
          nonce: 'nonce-pre-restart-001',
          sourceId: SOURCE_ID,
          keyId: KEY_V1,
          payload: ghostVerdict(),
        });
        const resp1 = await fetch(srv1.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...signedV1.headers },
          body: signedV1.canonicalBody,
        });
        expect(resp1.status).toBe(200);
        expect(ks1.isFired()).toBe(true);
      } finally {
        await srv1.close();
      }

      // Phase B: simulated restart with fresh PolyKillSwitch + rotated keyRing (KEY_V1 revoked, KEY_V2 active)
      const ks2 = createPolyKillSwitch({
        cancelAll: async () => ({ ok: true, status: 200 }),
      });
      expect(ks2.isFired()).toBe(false);

      const srv2 = await startGhostGuardWebhookServer({
        killSwitch: ks2,
        latchStatePath,
        requireHmac: true,
        hmacAuth: {
          keyRing: { [KEY_V2]: SECRET_V2 },
          allowedSources: [SOURCE_ID],
          nowEpochMs: () => now + 5_000,
        },
      });
      try {
        // Rehydrated latch is immediately active after restart
        expect(ks2.isFired()).toBe(true);
        const health = (await (await fetch(srv2.url.replace('/ghost-alert', '/health'))).json()) as {
          ok: boolean;
          latched: boolean;
        };
        expect(health).toEqual({ ok: true, latched: true });

        // Revoked KEY_V1 rejected with 401
        const revoked = signGhostGuardPayload({
          secret: SECRET_V1,
          timestampMs: now + 5_000,
          nonce: 'nonce-post-restart-revoked',
          sourceId: SOURCE_ID,
          keyId: KEY_V1,
          payload: ghostVerdict('REVOKED_KEY', ALT_TX_HASH),
        });
        const rRevoked = await fetch(srv2.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...revoked.headers },
          body: revoked.canonicalBody,
        });
        expect(rRevoked.status).toBe(401);

        // Rotated KEY_V2 accepted with 200 and preserves latched state cleanly
        const rotated = signGhostGuardPayload({
          secret: SECRET_V2,
          timestampMs: now + 5_000,
          nonce: 'nonce-post-restart-v2',
          sourceId: SOURCE_ID,
          keyId: KEY_V2,
          payload: ghostVerdict('POST_RESTART_GHOST', ALT_TX_HASH),
        });
        const rRotated = await fetch(srv2.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...rotated.headers },
          body: rotated.canonicalBody,
        });
        const body2 = (await rRotated.json()) as { ok: boolean; latched: boolean; issued: boolean };
        expect(rRotated.status).toBe(200);
        expect(body2.ok).toBe(true);
        expect(body2.latched).toBe(true);
        expect(body2.issued).toBe(false);
      } finally {
        await srv2.close();
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('supports dual-key rotation, source allowlist enforcement, requireHmac fail-closed, and Rust canonical JSON parity', async () => {
    const killSwitch = createPolyKillSwitch({
      cancelAll: async () => ({ ok: true, status: 200 }),
    });

    await expect(
      startGhostGuardWebhookServer({ killSwitch, requireHmac: true }),
    ).rejects.toThrow(/requireHmac=true/);

    // Verify canonical JSON matches Rust `callback::canonical_json_string` byte-for-byte
    const rustParityEvent = {
      tx_hash: KNOWN_GHOST_FILL_TX_HASH,
      market: 'btc-updown-5m',
      side: 'SELL',
      size: 100.0,
      price: 0.52,
      counterparty: null,
      reason: 'TRANSFER_FROM_FAILED',
      timestamp: 1_700_000_010,
    };
    expect(canonicalizeJson(rustParityEvent)).toBe(
      `{"counterparty":null,"market":"btc-updown-5m","price":0.52,"reason":"TRANSFER_FROM_FAILED","side":"SELL","size":100,"timestamp":1700000010,"tx_hash":"${KNOWN_GHOST_FILL_TX_HASH}"}`,
    );

    const now = 1_700_000_000_000;
    const server = await startGhostGuardWebhookServer({
      killSwitch,
      hmacAuth: {
        keyRing: { [KEY_V1]: SECRET_V1, [KEY_V2]: SECRET_V2 },
        allowedSources: [SOURCE_ID],
        nowEpochMs: () => now,
      },
    });

    try {
      // Disallowed source rejected with 401
      const badSource = signGhostGuardPayload({
        secret: SECRET_V1,
        timestampMs: now,
        nonce: 'nonce-bad-source',
        sourceId: 'untrusted-caller',
        keyId: KEY_V1,
        payload: ghostVerdict(),
      });
      const rBadSrc = await fetch(server.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...badSource.headers },
        body: badSource.canonicalBody,
      });
      expect(rBadSrc.status).toBe(401);
      expect(killSwitch.isFired()).toBe(false);

      // Both KEY_V1 and KEY_V2 valid during rotation overlap window
      const real1 = { verdict: 'Real' as const, tx_hash: ALT_TX_HASH, block: 100 };
      const s1 = signGhostGuardPayload({
        secret: SECRET_V1,
        timestampMs: now,
        nonce: 'nonce-dual-k1',
        sourceId: SOURCE_ID,
        keyId: KEY_V1,
        payload: real1,
      });
      expect(
        (await fetch(server.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...s1.headers },
          body: s1.canonicalBody,
        })).status,
      ).toBe(200);

      const s2 = signGhostGuardPayload({
        secret: SECRET_V2,
        timestampMs: now,
        nonce: 'nonce-dual-k2',
        sourceId: SOURCE_ID,
        keyId: KEY_V2,
        payload: real1,
      });
      expect(
        (await fetch(server.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...s2.headers },
          body: s2.canonicalBody,
        })).status,
      ).toBe(200);
    } finally {
      await server.close();
    }
  });

  it('10. matches shared Rust/TS cross-language HMAC-SHA256 golden vectors and accepts golden HTTP request', async () => {
    // Shared cross-language Golden Vector 1 (FillVerdict::Ghost) — mirrored verbatim in
    // sidecars/ghost-guard/src/callback.rs::tests::sign_and_verify_constant_time_and_golden_vector
    const GV_SECRET = 'test-hmac-secret-v1';
    const GV_SOURCE = 'ghostguard-sidecar';
    const GV_KEY_ID = 'key-v1';
    const GV1_TS = 1_700_000_000_123;
    const GV1_NONCE = 'nonce-golden-001';
    const GV1_EXPECTED_BODY =
      '{"counterparty":"0xdeadbeef0000000000000000000000000000cafe","reason":"TRANSFER_FROM_FAILED","tx_hash":"0x9e3230abde0f569da87511a6f8823076f7b211bb00d10689db3b7c50d6652df0","verdict":"Ghost"}';
    const GV1_EXPECTED_SIG =
      '3a3e50f69b024c8dbff4a26291b2566830938b83523cf4322b6d413d20d28a2b';

    const gv1Signed = signGhostGuardPayload({
      secret: GV_SECRET,
      timestampMs: GV1_TS,
      nonce: GV1_NONCE,
      sourceId: GV_SOURCE,
      keyId: GV_KEY_ID,
      payload: {
        verdict: 'Ghost',
        tx_hash: '0x9e3230abde0f569da87511a6f8823076f7b211bb00d10689db3b7c50d6652df0',
        reason: 'TRANSFER_FROM_FAILED',
        counterparty: '0xdeadbeef0000000000000000000000000000cafe',
      },
    });
    expect(gv1Signed.canonicalBody).toBe(GV1_EXPECTED_BODY);
    expect(gv1Signed.signature).toBe(GV1_EXPECTED_SIG);

    // Shared cross-language Golden Vector 2 (GhostFillEvent with whole-float normalization)
    const GV2_TS = 1_700_000_010_456;
    const GV2_NONCE = 'nonce-golden-002';
    const GV2_EXPECTED_BODY =
      '{"counterparty":null,"market":"btc-updown-5m","price":0.52,"reason":"TRANSFER_FROM_FAILED","side":"SELL","size":100,"timestamp":1700000010,"tx_hash":"0x9e3230abde0f569da87511a6f8823076f7b211bb00d10689db3b7c50d6652df0"}';
    const GV2_EXPECTED_SIG =
      'a51b14ac96acdc3a46078111bb7ab71b01d119504fccb88243b8a9f4a40ac2c5';

    const gv2Signed = signGhostGuardPayload({
      secret: GV_SECRET,
      timestampMs: GV2_TS,
      nonce: GV2_NONCE,
      sourceId: GV_SOURCE,
      keyId: GV_KEY_ID,
      payload: {
        tx_hash: '0x9e3230abde0f569da87511a6f8823076f7b211bb00d10689db3b7c50d6652df0',
        market: 'btc-updown-5m',
        side: 'SELL',
        size: 100.0,
        price: 0.52,
        counterparty: null,
        reason: 'TRANSFER_FROM_FAILED',
        timestamp: 1_700_000_010,
      },
    });
    expect(gv2Signed.canonicalBody).toBe(GV2_EXPECTED_BODY);
    expect(gv2Signed.signature).toBe(GV2_EXPECTED_SIG);

    // End-to-end verification: server accepts exact Golden Vector 1 over HTTP and fires kill switch
    const killSwitch = createPolyKillSwitch({
      cancelAll: async () => ({ ok: true, status: 200 }),
    });
    const server = await startGhostGuardWebhookServer({
      killSwitch,
      requireHmac: true,
      hmacAuth: {
        keyRing: { [GV_KEY_ID]: GV_SECRET },
        allowedSources: [GV_SOURCE],
        nowEpochMs: () => GV1_TS,
      },
    });
    try {
      const resp = await fetch(server.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-GhostGuard-Timestamp': String(GV1_TS),
          'X-GhostGuard-Nonce': GV1_NONCE,
          'X-GhostGuard-Source': GV_SOURCE,
          'X-GhostGuard-Key-Id': GV_KEY_ID,
          'X-GhostGuard-Signature': GV1_EXPECTED_SIG,
        },
        body: GV1_EXPECTED_BODY,
      });
      expect(resp.status).toBe(200);
      expect(killSwitch.isFired()).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('11. rejects tampered/uppercase signature hex with 401 and bounds post-restart replay via timestamp window', async () => {
    const now = 1_700_000_000_000;
    const ks1 = createPolyKillSwitch({
      cancelAll: async () => ({ ok: true, status: 200 }),
    });
    const srv1 = await startGhostGuardWebhookServer({
      killSwitch: ks1,
      requireHmac: true,
      hmacAuth: {
        keyRing: { [KEY_V1]: SECRET_V1 },
        allowedSources: [SOURCE_ID],
        maxSkewMs: 30_000,
        nowEpochMs: () => now,
      },
    });

    const signed = signGhostGuardPayload({
      secret: SECRET_V1,
      timestampMs: now,
      nonce: 'nonce-sig-check-001',
      sourceId: SOURCE_ID,
      keyId: KEY_V1,
      payload: ghostVerdict(),
    });

    try {
      // Single-char tampered signature hex -> 401
      const flippedSig =
        (signed.signature[0] === '0' ? '1' : '0') + signed.signature.slice(1);
      const rFlipped = await fetch(srv1.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...signed.headers,
          'X-GhostGuard-Signature': flippedSig,
        },
        body: signed.canonicalBody,
      });
      expect(rFlipped.status).toBe(401);

      // Uppercase signature hex -> 401 (fails closed)
      const rUpper = await fetch(srv1.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...signed.headers,
          'X-GhostGuard-Signature': signed.signature.toUpperCase(),
        },
        body: signed.canonicalBody,
      });
      expect(rUpper.status).toBe(401);
      expect(ks1.isFired()).toBe(false);

      // Legitimate delivery succeeds on srv1
      const rOk = await fetch(srv1.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...signed.headers },
        body: signed.canonicalBody,
      });
      expect(rOk.status).toBe(200);
      expect(ks1.isFired()).toBe(true);
    } finally {
      await srv1.close();
    }

    // Simulated restart: in-memory nonce cache resets, same KEY_V1 remains active,
    // but once maxSkewMs (30s) elapses, replaying the pre-restart request is rejected with 401.
    const ks2 = createPolyKillSwitch({
      cancelAll: async () => ({ ok: true, status: 200 }),
    });
    const srv2 = await startGhostGuardWebhookServer({
      killSwitch: ks2,
      requireHmac: true,
      hmacAuth: {
        keyRing: { [KEY_V1]: SECRET_V1 },
        allowedSources: [SOURCE_ID],
        maxSkewMs: 30_000,
        nowEpochMs: () => now + 31_000,
      },
    });
    try {
      const rPostRestartReplay = await fetch(srv2.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...signed.headers },
        body: signed.canonicalBody,
      });
      expect(rPostRestartReplay.status).toBe(401);
      expect(ks2.isFired()).toBe(false);
    } finally {
      await srv2.close();
    }
  });
});
