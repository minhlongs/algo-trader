/**
 * Private Paper Beta — Fail-Closed Signup Allowlist.
 *
 * Enforces explicit server-side enrollment for external paper pilot accounts.
 * Missing, empty, malformed, or wildcard allowlist configurations always fail closed.
 */

import { sha256Hex } from './poly-beta-security';
import type { PolyBetaEnv } from './poly-beta-types';

const SHA256_PREFIX = 'sha256:';
const SHA256_HEX_RE = /^[a-f0-9]{64}$/;
const SIMPLE_EMAIL_RE = /^[^\s@*]+@[^\s@*]+\.[^\s@*]+$/;

export interface ParsedSignupAllowlist {
  readonly emails: ReadonlySet<string>;
  readonly hashes: ReadonlySet<string>;
}

export interface SignupAllowlistDecision {
  readonly allowed: boolean;
  readonly reason?: 'SIGNUP_ALLOWLIST_EMPTY' | 'SIGNUP_EMAIL_NOT_ENROLLED';
}

export function normalizeAllowlistEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseSignupAllowlist(raw: string | undefined): ParsedSignupAllowlist {
  const emails = new Set<string>();
  const hashes = new Set<string>();
  if (!raw) return { emails, hashes };

  for (const token of raw.split(/[\s,;]+/)) {
    const normalized = token.trim().toLowerCase();
    if (!normalized || normalized.includes('*')) continue;
    if (normalized.startsWith(SHA256_PREFIX)) {
      const digest = normalized.slice(SHA256_PREFIX.length);
      if (SHA256_HEX_RE.test(digest)) hashes.add(digest);
      continue;
    }
    if (SIMPLE_EMAIL_RE.test(normalized)) {
      emails.add(normalized);
    }
  }
  return { emails, hashes };
}

export async function isEmailAuthorizedForBetaSignup(
  email: string,
  env: Pick<PolyBetaEnv, 'BETA_SIGNUP_ALLOWLIST' | 'SIGNUP_GATE_MODE'>,
): Promise<SignupAllowlistDecision> {
  // Fail-closed invariant: no default-allow mode exists. Regardless of SIGNUP_GATE_MODE,
  // signup always requires an explicit match in BETA_SIGNUP_ALLOWLIST.
  const parsed = parseSignupAllowlist(env.BETA_SIGNUP_ALLOWLIST);
  if (parsed.emails.size === 0 && parsed.hashes.size === 0) {
    return { allowed: false, reason: 'SIGNUP_ALLOWLIST_EMPTY' };
  }

  const normalized = normalizeAllowlistEmail(email);
  if (parsed.emails.has(normalized)) {
    return { allowed: true };
  }
  if (parsed.hashes.size > 0) {
    const digest = await sha256Hex(normalized);
    if (parsed.hashes.has(digest)) {
      return { allowed: true };
    }
  }
  return { allowed: false, reason: 'SIGNUP_EMAIL_NOT_ENROLLED' };
}
