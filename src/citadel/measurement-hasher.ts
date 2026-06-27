/**
 * Measurement Hasher
 * SHA-256 digest of agent code blob — used as TEE measurement in attestation.
 * In simulation mode the "blob" is a deterministic string representation.
 */

import crypto from 'crypto';

export interface MeasurementInput {
  /** Arbitrary agent identity string (e.g. version tag, commit SHA, binary path) */
  agentIdentifier: string;
  /** Optional extra data mixed into measurement (config hash, env flags, etc.) */
  extra?: string;
}

export interface Measurement {
  hash: string;       // hex SHA-256
  algorithm: string;  // always 'sha256'
  input: string;      // what was hashed (for audit — never secrets)
}

/**
 * Compute a SHA-256 measurement hash from agent identity data.
 * Production TEE would hash the actual enclave code pages; sim mode hashes
 * a canonical string so tests remain deterministic.
 */
export function computeMeasurement(input: MeasurementInput): Measurement {
  const canonical = `agent:${input.agentIdentifier}|extra:${input.extra ?? ''}`;
  const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  return { hash, algorithm: 'sha256', input: canonical };
}

/**
 * Verify that a claimed measurement hash matches re-computed value.
 * Uses timing-safe comparison to prevent side-channel leaks.
 */
export function verifyMeasurement(claimed: string, input: MeasurementInput): boolean {
  const { hash } = computeMeasurement(input);
  if (claimed.length !== hash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(claimed, 'hex'), Buffer.from(hash, 'hex'));
}
