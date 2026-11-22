#!/usr/bin/env node
/**
 * Founder-only offline invite token issuer for Private Paper Beta (`USER_001`).
 * Generates a 256-bit cryptographically random token and outputs:
 *   1) The hashed record for `BETA_SIGNUP_INVITES` Cloudflare Secret (never stores plaintext).
 *   2) The one-time raw invite token to deliver out-of-band over a pre-verified private channel.
 *
 * Usage:
 *   node scripts/poly-beta-issue-invite.mjs --email user001@example.com --ttl-hours 24
 */

import { createHash, randomBytes } from 'node:crypto';

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const rawEmail = getArg('--email');
const ttlHours = Number(getArg('--ttl-hours') ?? '24');

if (!rawEmail || !rawEmail.includes('@') || rawEmail.includes('*')) {
  console.error('Error: --email <valid-email> is required (wildcards forbidden).');
  process.exit(1);
}
if (!Number.isFinite(ttlHours) || ttlHours <= 0 || ttlHours > 168) {
  console.error('Error: --ttl-hours must be a number in (0, 168].');
  process.exit(1);
}

const email = rawEmail.trim().toLowerCase();
const rawToken = randomBytes(32).toString('hex');
const tokenHash = createHash('sha256').update(rawToken).digest('hex');
const expiresAtMs = Date.now() + Math.round(ttlHours * 3600 * 1000);

const secretRecord = [{ tokenHash, email, expiresAtMs, disabled: false }];

console.log(
  JSON.stringify(
    {
      deliveryWarning:
        'Deliver rawInviteToken ONLY over a pre-verified private channel. NEVER place in URLs, git, or logs.',
      rawInviteToken: rawToken,
      betaSignupInvitesSecretJson: JSON.stringify(secretRecord),
      expiresAtIso: new Date(expiresAtMs).toISOString(),
    },
    null,
    2,
  ),
);
