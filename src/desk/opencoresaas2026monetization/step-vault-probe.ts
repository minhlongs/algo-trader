// SPDX-License-Identifier: MIT
/**
 * Behavioral probe for the encrypted API key vault.
 *
 * The vault's claim is confidentiality *and* integrity. A cipher that accepts modified ciphertext,
 * a flipped auth tag, or the wrong key is storage rather than a vault, so this probe round-trips a
 * value and then requires each of those four tamper cases to be refused. It generates its own key
 * with `crypto.randomBytes`, so it never reads or depends on a real secret.
 *
 * @module desk/opencoresaas2026monetization/step-vault-probe
 */

import crypto from 'node:crypto';
import * as vaultCipher from '../../seed/security/crypto-cipher';
import { fail, ok } from './step-governance-support';
import type { StepProbeResult } from './step-probe-types';

const KEY_LENGTH = 32;

export function probeKeyVault(): StepProbeResult {
  const cipher = vaultCipher;
  const key = crypto.randomBytes(KEY_LENGTH);
  const secret = 'tenant-api-key-secret';

  let sealed: { ciphertext: string; iv: string; tag: string };
  try {
    sealed = cipher.encrypt(secret, key);
  } catch (err) {
    return fail(`encrypt rejected a valid key: ${String(err).slice(0, 80)}`);
  }

  if (sealed.ciphertext.length === 0 || sealed.iv.length === 0 || sealed.tag.length === 0) {
    return fail('encrypt produced an incomplete envelope');
  }

  try {
    if (cipher.decrypt(sealed.ciphertext, sealed.iv, sealed.tag, key) !== secret) {
      return fail('decrypt did not return the original plaintext');
    }
  } catch {
    return fail('decrypt rejected the ciphertext it just produced');
  }

  const flip = (b64: string): string => {
    const buf = Buffer.from(b64, 'base64');
    buf[0] ^= 0xff;
    return buf.toString('base64');
  };

  const rejections: Array<[string, () => string]> = [
    ['wrong key', () => cipher.decrypt(sealed.ciphertext, sealed.iv, sealed.tag, crypto.randomBytes(KEY_LENGTH))],
    ['tampered ciphertext', () => cipher.decrypt(flip(sealed.ciphertext), sealed.iv, sealed.tag, key)],
    ['tampered auth tag', () => cipher.decrypt(sealed.ciphertext, sealed.iv, flip(sealed.tag), key)],
    ['tampered IV', () => cipher.decrypt(sealed.ciphertext, flip(sealed.iv), sealed.tag, key)],
  ];

  for (const [label, attempt] of rejections) {
    try {
      attempt();
      return fail(`${label} was accepted — the cipher does not authenticate its input`);
    } catch {
      // The rejection is the required behavior.
    }
  }

  return ok('AES-256-GCM round-trip holds; wrong key, tampered ciphertext, tag and IV are all refused');
}
