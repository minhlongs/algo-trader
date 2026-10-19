// SPDX-License-Identifier: MIT
/**
 * HMAC-SHA256 Cryptographic License Gate
 * Enforces tier entitlements with HTTP 402 Payment Required for unauthorized access.
 *
 * @module desk/opencoresaas2026monetization/license-gate
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { TierLevel } from './catalog';

export interface LicenseTokenPayload {
  readonly tenantId: string;
  readonly tier: TierLevel;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly maxStrategies: number;
  readonly maxRps: number;
}

export interface LicenseVerificationResult {
  readonly isValid: boolean;
  readonly statusCode: 200 | 401 | 402 | 403;
  readonly payload?: LicenseTokenPayload;
  readonly error?: string;
  readonly upgradeUrl?: string;
}

const TIER_HIERARCHY: Record<TierLevel, number> = {
  BASIC: 1,
  PREMIUM: 2,
  ENTERPRISE: 3,
  MASTER: 4,
};

export class LicenseGate {
  private readonly secretKey: string;

  constructor(secretKey: string = process.env.LICENSE_HMAC_SECRET || 'algo-trader-master-secret-2026') {
    this.secretKey = secretKey;
  }

  signToken(payload: LicenseTokenPayload): string {
    const serialized = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.secretKey).update(serialized).digest('base64url');
    return `${serialized}.${signature}`;
  }

  verifyToken(token: string, requiredTier: TierLevel = 'BASIC'): LicenseVerificationResult {
    if (!token || !token.includes('.')) {
      return {
        isValid: false,
        statusCode: 401,
        error: 'Missing or malformed license token',
      };
    }

    const [serialized, signature] = token.split('.');
    const expectedSig = createHmac('sha256', this.secretKey).update(serialized).digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);

    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return {
        isValid: false,
        statusCode: 401,
        error: 'Invalid license signature or tampered payload',
      };
    }

    try {
      const payload = JSON.parse(Buffer.from(serialized, 'base64url').toString('utf8')) as LicenseTokenPayload;
      const now = Date.now();

      if (payload.expiresAt < now) {
        return {
          isValid: false,
          statusCode: 402,
          payload,
          error: 'License token has expired. Payment required to renew subscription.',
          upgradeUrl: `https://app.algo-trader.dev/billing/renew?tenant=${payload.tenantId}`,
        };
      }

      if (TIER_HIERARCHY[payload.tier] < TIER_HIERARCHY[requiredTier]) {
        return {
          isValid: false,
          statusCode: 402,
          payload,
          error: `Feature requires tier ${requiredTier}, current tier is ${payload.tier}. Upgrade required.`,
          upgradeUrl: `https://app.algo-trader.dev/billing/upgrade?tier=${requiredTier}&tenant=${payload.tenantId}`,
        };
      }

      return {
        isValid: true,
        statusCode: 200,
        payload,
      };
    } catch {
      return {
        isValid: false,
        statusCode: 401,
        error: 'Corrupt license payload structure',
      };
    }
  }
}
