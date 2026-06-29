/**
 * License Validation Middleware
 * ROIaaS Phase 2 - RaaS gate middleware for license enforcement
 */
import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { LicenseService } from '../billing/license-service';
import { LicenseTier, LicenseStatus } from '../../shared/types/license';
import { logger } from '../../shared/utils/logger';

const PUBLIC_PATHS = ['/health', '/ready', '/metrics', '/api/v1/licenses'];

export interface LicenseAuthResult {
  licenseId: string;
  tier: LicenseTier;
  isValid: boolean;
  error?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    licenseAuth?: LicenseAuthResult;
    getLicenseTier: () => LicenseTier | undefined;
    isLicenseValid: () => boolean;
  }
}

const licenseCache = new Map<string, { license: unknown; cachedAt: number }>();
const CACHE_TTL_MS = 60_000;

export async function licenseValidationPlugin(fastify: FastifyInstance) {
  const licenseService = LicenseService.getInstance();

  fastify.decorateRequest('getLicenseTier', function (this: FastifyRequest) {
    return this.licenseAuth?.isValid ? this.licenseAuth.tier : undefined;
  });

  fastify.decorateRequest('isLicenseValid', function (this: FastifyRequest) {
    return !!this.licenseAuth?.isValid;
  });

  fastify.addHook('preHandler', async (request, _reply) => {
    // EC#33: null check for routeOptions
    const route = request.routeOptions?.url || '';

    if (PUBLIC_PATHS.some((path) => route.startsWith(path))) {
      return;
    }

    const apiKey = request.headers['x-api-key'] as string | undefined;
    if (!apiKey) {
      request.licenseAuth = {
        licenseId: '',
        tier: LicenseTier.FREE,
        isValid: false,
        error: 'Missing API key',
      };
      return;
    }

    // EC#31: Check license cache first
    const cached = licenseCache.get(apiKey);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      const license = cached.license as { status: LicenseStatus; expiresAt?: string; id: string; tier: LicenseTier };
      if (license.status !== LicenseStatus.ACTIVE) {
        request.licenseAuth = {
          licenseId: license.id,
          tier: license.tier,
          isValid: false,
          error: `License is ${license.status}`,
        };
        return;
      }
      if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
        request.licenseAuth = {
          licenseId: license.id,
          tier: license.tier,
          isValid: false,
          error: 'License expired',
        };
        return;
      }
      request.licenseAuth = {
        licenseId: license.id,
        tier: license.tier,
        isValid: true,
      };
      return;
    }

    const license = licenseService.getLicenseByKey(apiKey);
    if (!license) {
      request.licenseAuth = {
        licenseId: '',
        tier: LicenseTier.FREE,
        isValid: false,
        error: 'Invalid license key',
      };
      return;
    }

    if (license.status !== LicenseStatus.ACTIVE) {
      request.licenseAuth = {
        licenseId: license.id,
        tier: license.tier,
        isValid: false,
        error: `License is ${license.status}`,
      };
      return;
    }

    if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
      request.licenseAuth = {
        licenseId: license.id,
        tier: license.tier,
        isValid: false,
        error: 'License expired',
      };
      return;
    }

    // EC#31: Cache the license result
    licenseCache.set(apiKey, { license, cachedAt: Date.now() });

    request.licenseAuth = {
      licenseId: license.id,
      tier: license.tier,
      isValid: true,
    };
  });
}
