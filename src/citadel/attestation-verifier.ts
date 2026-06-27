/**
 * Attestation Verifier
 * Verifies Citadel attestation quotes: JWT signature, freshness, measurement match.
 * Production: also validates SGX/TDX hardware quote (deferred to D2).
 */

import { verifyAttestationJwt, type QuotePayload } from './quote-simulator';
import { verifyMeasurement, type MeasurementInput } from './measurement-hasher';

export interface VerifyAttestationOpts {
  jwt: string;
  /** Expected subscriber DID — must match JWT claim */
  expectedDid: string;
  /** If provided, re-computes measurement and compares */
  measurementInput?: MeasurementInput;
  /** Max age in seconds (default: 300) */
  maxAgeSeconds?: number;
}

export interface AttestationVerifyResult {
  valid: boolean;
  payload?: QuotePayload;
  error?: string;
}

/**
 * Verify an attestation JWT end-to-end.
 * Checks: signature, expiry, issuer, DID binding, optional measurement re-check.
 */
export async function verifyAttestation(
  opts: VerifyAttestationOpts,
): Promise<AttestationVerifyResult> {
  const maxAge = opts.maxAgeSeconds ?? 300;

  let payload: QuotePayload;
  try {
    payload = await verifyAttestationJwt(opts.jwt);
  } catch (err) {
    return { valid: false, error: `JWT verification failed: ${String(err)}` };
  }

  // DID binding check
  if (payload.did !== opts.expectedDid) {
    return {
      valid: false,
      error: `DID mismatch: expected ${opts.expectedDid}, got ${payload.did}`,
    };
  }

  // Freshness check: age >= maxAge rejects at-or-past the window boundary
  const now = Math.floor(Date.now() / 1000);
  const age = now - (payload.iat ?? 0);
  if (age >= maxAge) {
    return { valid: false, error: `Attestation too old: ${age}s >= ${maxAge}s` };
  }

  // Optional measurement re-verification
  if (opts.measurementInput) {
    const ok = verifyMeasurement(payload.measurement, opts.measurementInput);
    if (!ok) {
      return {
        valid: false,
        error: `Measurement mismatch: claimed ${payload.measurement}`,
      };
    }
  }

  return { valid: true, payload };
}
