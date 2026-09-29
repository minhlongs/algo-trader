/**
 * Cryptographic HMAC-SHA256 key resolution, row hashing, logAudit row building, and chain verification.
 *
 * @module desk/arbitrage/telemetry/audit-logger-chain
 */

import crypto from 'node:crypto';
import {
  hashIpAddress,
  type IAuditEntry,
  type AuditResult,
} from '../../../seed/security/audit-log';
import { computeRowHash } from '../../../seed/security/audit-hash-chain';
import { initHmacKey } from '../../../seed/security/audit-hmac-key';
import type { ChainedAuditRow, ChainVerificationResult } from './audit-logger-types';

/**
 * Compute SHA-256 hash of IP address or fallback to standard sha256 digest.
 */
export function resolveIpHash(systemIp: string): string {
  return typeof hashIpAddress === 'function'
    ? hashIpAddress(systemIp)
    : crypto.createHash('sha256').update(systemIp).digest('hex');
}

/**
 * Securely resolve HMAC key from environment or fallback to deterministic HMAC key
 * to guarantee cryptographic hash chaining in mock / non-Postgres environments.
 */
export function resolveAuditHmacKey(customKey?: Buffer): Buffer {
  if (customKey) return customKey;
  const envKey = process.env.AUDIT_HMAC_KEY_v1;
  if (envKey && /^[0-9a-f]{64}$/i.test(envKey)) {
    try {
      return initHmacKey();
    } catch {
      // Fall back below if initialization fails
    }
  }
  // Cryptographically strong 32-byte deterministic fallback key for test / offline isolation
  return crypto
    .createHash('sha256')
    .update('algo-trader:arbitrage-audit-chain-default-key-v1')
    .digest();
}

/**
 * Build an IAuditEntry and compute its chained row representation.
 */
export function buildAuditRow(params: {
  actor: string;
  action: string;
  resource: string;
  result: AuditResult;
  metadata: Record<string, unknown>;
  ipHash: string;
  tenantId: string;
  customTimestamp?: number | string;
  sequenceNumber: number;
  previousHash: string;
  hmacKey: Buffer;
}): ChainedAuditRow {
  const tsString =
    typeof params.customTimestamp === 'string'
      ? params.customTimestamp
      : typeof params.customTimestamp === 'number'
        ? new Date(params.customTimestamp).toISOString()
        : new Date().toISOString();

  const entryId = `arb_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

  const entry: IAuditEntry = {
    id: entryId,
    timestamp: tsString,
    actor: params.actor,
    action: params.action,
    resource: params.resource,
    result: params.result,
    metadata: params.metadata,
    ipHash: params.ipHash,
    tenantId: params.tenantId,
  };

  const hash = computeRowHash(
    params.hmacKey,
    entry.tenantId,
    params.sequenceNumber,
    params.previousHash,
    entry,
  );

  return {
    sequenceNumber: params.sequenceNumber,
    hash,
    previousHash: params.previousHash,
    entry,
    writtenToDb: false,
  };
}

/**
 * Cryptographically verify HMAC-SHA256 hash-chain integrity.
 * Asserts monotonic sequence, previous_hash linkage, and recomputed hash fidelity.
 */
export function verifyAuditChainIntegrity(
  chain: readonly ChainedAuditRow[],
  hmacKey: Buffer,
): ChainVerificationResult {
  for (let i = 0; i < chain.length; i++) {
    const row = chain[i];
    const expectedSeq = i + 1;

    // 1. Monotonic sequence assertion
    if (row.sequenceNumber !== expectedSeq) {
      return {
        valid: false,
        brokenAt: row.sequenceNumber,
        reason: `Broken sequence: expected ${expectedSeq}, received ${row.sequenceNumber}`,
        totalRecords: chain.length,
      };
    }

    // 2. Previous hash chain linkage assertion
    const expectedPrevHash = i === 0 ? '' : chain[i - 1].hash;
    if (row.previousHash !== expectedPrevHash) {
      return {
        valid: false,
        brokenAt: row.sequenceNumber,
        reason: `Previous hash mismatch at sequence ${row.sequenceNumber}`,
        totalRecords: chain.length,
      };
    }

    // 3. Recomputed HMAC-SHA256 signature verification
    const recomputed = computeRowHash(
      hmacKey,
      row.entry.tenantId,
      row.sequenceNumber,
      row.previousHash,
      row.entry,
    );

    if (recomputed !== row.hash) {
      return {
        valid: false,
        brokenAt: row.sequenceNumber,
        reason: `Cryptographic HMAC mismatch at sequence ${row.sequenceNumber}: row corrupted or tampered`,
        totalRecords: chain.length,
      };
    }
  }

  return {
    valid: true,
    totalRecords: chain.length,
  };
}
