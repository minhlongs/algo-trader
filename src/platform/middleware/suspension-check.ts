/**
 * Suspension Check Middleware
 * ROIaaS Phase 5 - Block API calls from suspended licenses
 * Integrated with Phase 6 - Audit Logging
 *
 * Returns 402 Payment Required error for suspended licenses.
 * Must be registered after license-validation middleware.
 */

import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { DunningService } from '../billing/dunning-service';
import { LicenseService } from '../billing/license-service';
import { AuditLogService } from '../audit/audit-log-service';

const PUBLIC_PATHS = ['/health', '/ready', '/metrics', '/api/v1/licenses'];

export interface SuspensionCheckResult {
  isSuspended: boolean;
  suspensionDate?: string;
  retryCount?: number;
  daysUntilSuspension?: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    suspensionCheck?: SuspensionCheckResult;
  }
}

export async function suspensionCheckPlugin(fastify: FastifyInstance) {
  const dunningService = DunningService.getInstance();
  const licenseService = LicenseService.getInstance();
  const auditService = AuditLogService.getInstance();

  fastify.addHook('preHandler', async (request, reply) => {
    const route = request.routeOptions.url || '';

    // Skip public paths
    if (PUBLIC_PATHS.some((path) => route.startsWith(path))) {
      return;
    }

    // Get license ID from request (set by license-validation middleware)
    const licenseId = (request as any).licenseAuth?.licenseId;
    if (!licenseId) {
      // License validation already handled this
      return;
    }

    // Check suspension status
    const suspensionStatus = await dunningService.getSuspensionStatus(licenseId);
    request.suspensionCheck = suspensionStatus;

    // Block suspended licenses
    if (suspensionStatus.isSuspended) {
      const license = await licenseService.getLicense(licenseId);

      // Log suspension event to audit trail
      await auditService.log(licenseId, 'suspension_warning', {
        tier: license?.tier,
        ip: request.ip,
        metadata: {
          suspensionDate: suspensionStatus.suspensionDate,
          retryCount: suspensionStatus.retryCount,
          isSuspended: true,
        },
      });

      return reply.code(402).send({
        error: 'Payment Required',
        message: 'License suspended due to payment failure',
        details: {
          licenseId: license?.id,
          licenseKey: license?.key?.substring(0, 12) + '...',
          suspensionDate: suspensionStatus.suspensionDate,
          retryCount: suspensionStatus.retryCount,
          reinstatementInfo: 'License will be automatically reinstated upon successful payment',
        },
      });
    }
  });
}

/**
 * Standalone middleware function for manual use
 */
export async function suspensionCheckMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
  done: () => void
) {
  const dunningService = DunningService.getInstance();
  const licenseService = LicenseService.getInstance();

  const apiKey = request.headers['x-api-key'] as string | undefined;
  if (!apiKey) {
    return done();
  }

  const license = await licenseService.getLicenseByKey(apiKey);
  if (!license) {
    return done();
  }

  // Check suspension status
  try {
    const status = await dunningService.getSuspensionStatus(license.id);
    (request as any).suspensionCheck = status;

    if (status.isSuspended) {
      return reply.code(402).send({
        error: 'Payment Required',
        message: 'License suspended due to payment failure',
        details: {
          licenseId: license.id,
          licenseKey: license.key.substring(0, 12) + '...',
          suspensionDate: status.suspensionDate,
          retryCount: status.retryCount,
          reinstatementInfo: 'License will be automatically reinstated upon successful payment',
        },
      });
    }

    done();
  } catch {
    done();
  }
}
