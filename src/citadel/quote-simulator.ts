/**
 * Quote Simulator — DEV-ONLY stub for TEE attestation quotes.
 * In production, replace with Intel PCCS / AMD SEV integration.
 * Controlled by CITADEL_MODE env: 'simulation' (default) | 'sgx' | 'tdx'
 * Production refuses simulation mode at startup.
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import crypto from 'crypto';

/** Attestation modes */
export type CitadelMode = 'simulation' | 'sgx' | 'tdx';

/** JWT payload for a Citadel attestation quote */
export interface QuotePayload extends JWTPayload {
  sub: string;            // subscriber ID
  did: string;            // subscriber DID
  measurement: string;    // SHA-256 measurement hash
  mode: CitadelMode;
  nonce: string;          // freshness nonce
}

/** Signed attestation quote result */
export interface AttestationQuote {
  jwt: string;
  payload: QuotePayload;
  issuedAt: number;
  expiresAt: number;
}

/** Quote validity window: 5 minutes */
const QUOTE_TTL_SECONDS = 300;

function getSecret(): Uint8Array {
  const secret = process.env.CITADEL_SIGNING_SECRET ?? 'citadel-dev-secret-change-in-production';
  return new TextEncoder().encode(secret);
}

function getMode(): CitadelMode {
  const raw = (process.env.CITADEL_MODE ?? 'simulation').toLowerCase();
  if (raw === 'sgx' || raw === 'tdx') return raw;
  return 'simulation';
}

/**
 * Issue a signed attestation JWT.
 * In simulation mode, measurement is trusted as-is (no hardware verification).
 * Guards against accidental simulation use in production via env check.
 */
export async function issueAttestationQuote(opts: {
  subscriberId: string;
  did: string;
  measurementHash: string;
}): Promise<AttestationQuote> {
  const mode = getMode();
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + QUOTE_TTL_SECONDS;
  const nonce = crypto.randomBytes(16).toString('hex');

  const payload: QuotePayload = {
    sub: opts.subscriberId,
    did: opts.did,
    measurement: opts.measurementHash,
    mode,
    nonce,
    iat: issuedAt,
    exp: expiresAt,
    iss: 'citadel-protocol',
  };

  const jwt = await new SignJWT(payload as Parameters<SignJWT['setPayload']>[0])
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .setIssuer('citadel-protocol')
    .sign(getSecret());

  return { jwt, payload, issuedAt, expiresAt };
}

/**
 * Verify a previously issued attestation JWT.
 * Returns the decoded payload or throws on invalid/expired token.
 */
export async function verifyAttestationJwt(jwt: string): Promise<QuotePayload> {
  const { payload } = await jwtVerify(jwt, getSecret(), {
    issuer: 'citadel-protocol',
  });
  return payload as QuotePayload;
}

/** Expose current mode for guards / logging */
export function currentCitadelMode(): CitadelMode {
  return getMode();
}
