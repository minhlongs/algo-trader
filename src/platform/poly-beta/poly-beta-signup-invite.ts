/**
 * Private Paper Beta — Fail-Closed Single-Use Invite Proof Verifier.
 *
 * `BETA_SIGNUP_ALLOWLIST` alone only proves an email string is listed; it does
 * not prove the registrant controls that identity. This module enforces a
 * Founder-issued, cryptographically unpredictable, single-use invite token
 * bound to a specific enrolled email and expiration timestamp.
 *
 * Security invariants:
 * - Fail-closed when `BETA_SIGNUP_INVITES` is missing, empty, or malformed.
 * - Rejects tokens shorter than 32 chars and rejects SHA-256(email) as a token.
 * - Compares SHA-256(inviteToken) against configured `tokenHash` in constant time.
 * - Enforces email binding, expiration (`nowMs < expiresAtMs`), and `!disabled`.
 * - Never logs raw invite tokens.
 */

import { sha256Hex } from './poly-beta-security';
import { normalizeAllowlistEmail } from './poly-beta-signup-allowlist';
import type { PolyBetaEnv } from './poly-beta-types';

const HEX_64_RE = /^[a-f0-9]{64}$/;
const MIN_INVITE_TOKEN_LENGTH = 32;
const MAX_INVITE_TOKEN_LENGTH = 128;

export interface BetaSignupInviteRecord {
  readonly tokenHash: string;
  readonly email: string;
  readonly expiresAtMs: number;
  readonly disabled: boolean;
}

export type InviteVerificationResult =
  | { readonly ok: true; readonly tokenHash: string; readonly email: string; readonly expiresAtMs: number }
  | {
      readonly ok: false;
      readonly code:
        | 'INVITE_PROOF_UNAVAILABLE'
        | 'INVITE_TOKEN_INVALID'
        | 'INVITE_TOKEN_DISABLED'
        | 'INVITE_TOKEN_EXPIRED'
        | 'INVITE_EMAIL_MISMATCH';
    };

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function parseBetaSignupInvites(raw: string | undefined): readonly BetaSignupInviteRecord[] {
  if (!raw || raw.trim().length === 0) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const valid: BetaSignupInviteRecord[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const tokenHash = typeof rec.tokenHash === 'string' ? rec.tokenHash.trim().toLowerCase() : '';
    const email = typeof rec.email === 'string' ? normalizeAllowlistEmail(rec.email) : '';
    const expiresAtMs = typeof rec.expiresAtMs === 'number' ? rec.expiresAtMs : Number.NaN;
    const disabled = rec.disabled === true;

    if (!HEX_64_RE.test(tokenHash)) continue;
    if (!email || !email.includes('@') || email.includes('*')) continue;
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= 0) continue;

    valid.push({ tokenHash, email, expiresAtMs, disabled });
  }
  return valid;
}

export async function verifyBetaSignupInviteToken(
  email: string,
  inviteToken: string | undefined,
  env: Pick<PolyBetaEnv, 'BETA_SIGNUP_INVITES'>,
  nowMs: number,
): Promise<InviteVerificationResult> {
  const invites = parseBetaSignupInvites(env.BETA_SIGNUP_INVITES);
  if (invites.length === 0) {
    return { ok: false, code: 'INVITE_PROOF_UNAVAILABLE' };
  }

  const trimmedToken = typeof inviteToken === 'string' ? inviteToken.trim() : '';
  if (trimmedToken.length < MIN_INVITE_TOKEN_LENGTH || trimmedToken.length > MAX_INVITE_TOKEN_LENGTH) {
    return { ok: false, code: 'INVITE_TOKEN_INVALID' };
  }

  const normalizedEmail = normalizeAllowlistEmail(email);
  const emailHash = await sha256Hex(normalizedEmail);
  // Explicitly refuse SHA-256(email) as an authentication factor.
  if (timingSafeEqualHex(trimmedToken.toLowerCase(), emailHash)) {
    return { ok: false, code: 'INVITE_TOKEN_INVALID' };
  }

  const candidateHash = await sha256Hex(trimmedToken);
  if (timingSafeEqualHex(candidateHash, emailHash)) {
    return { ok: false, code: 'INVITE_TOKEN_INVALID' };
  }

  let matched: BetaSignupInviteRecord | null = null;
  for (const rec of invites) {
    if (timingSafeEqualHex(candidateHash, rec.tokenHash)) {
      matched = rec;
    }
  }

  if (!matched) {
    return { ok: false, code: 'INVITE_TOKEN_INVALID' };
  }
  if (matched.disabled) {
    return { ok: false, code: 'INVITE_TOKEN_DISABLED' };
  }
  if (nowMs >= matched.expiresAtMs) {
    return { ok: false, code: 'INVITE_TOKEN_EXPIRED' };
  }
  if (matched.email !== normalizedEmail) {
    return { ok: false, code: 'INVITE_EMAIL_MISMATCH' };
  }

  return {
    ok: true,
    tokenHash: matched.tokenHash,
    email: matched.email,
    expiresAtMs: matched.expiresAtMs,
  };
}
