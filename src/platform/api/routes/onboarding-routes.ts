/**
 * Onboarding API Routes
 * RaaS Phase 16 - Buyer signup, verification, and license activation
 *
 * Endpoints:
 * - POST /api/v1/signup    — begin signup, returns pendingId + "code sent" message
 * - POST /api/v1/verify    — submit 6-digit code, marks email verified
 * - POST /api/v1/activate  — create license, return key + API instructions
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { OnboardingService } from '../../billing/onboarding-service';

interface SignupBody {
  email: string;
  tier: 'FREE' | 'PRO' | 'ENTERPRISE';
  walletAddress?: string;
}

interface VerifyBody {
  email: string;
  code: string;
}

interface ActivateBody {
  email: string;
}

/** Tier gate guard — returns false if response already sent */
function requireTierGate(request: FastifyRequest, reply: FastifyReply, minTier: string): boolean {
  const userTier = request.getLicenseTier();
  if (!userTier) { reply.code(401).send({ error: 'No license' }); return false; }
  const order: Record<string, number> = { FREE: 0, PRO: 1, ENTERPRISE: 2 };
  if ((order[userTier ?? ''] ?? 0) < (order[minTier] ?? 0)) {
    reply.code(403).send({ error: 'Insufficient tier', required: minTier, current: userTier });
    return false;
  }
  return true;
}

export async function onboardingRoutes(fastify: FastifyInstance) {
  const onboardingService = OnboardingService.getInstance();

  /**
   * POST /signup
   * Body: { email, tier, walletAddress? }
   * Returns: { pendingId, message }
   */
  fastify.post(
    '/signup',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'tier'],
          properties: {
            email: { type: 'string', format: 'email' },
            tier: { type: 'string', enum: ['FREE', 'PRO', 'ENTERPRISE'] },
            walletAddress: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: SignupBody }>, reply: FastifyReply) => {
    if (!requireTierGate(request, reply, 'FREE')) return;
      try {
        const result = await onboardingService.signup(request.body);
        return reply.code(201).send({
          pendingId: result.pendingId,
          message: 'Verification code sent. Check server logs for the code (email integration pending).',
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Signup failed';
        const status = message.includes('already') ? 409 : 400;
        return reply.code(status).send({ error: message });
      }
    }
  );

  /**
   * POST /verify
   * Body: { email, code }
   * Returns: { verified: true }
   */
  fastify.post(
    '/verify',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'code'],
          properties: {
            email: { type: 'string' },
            code: { type: 'string', minLength: 6, maxLength: 6 },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: VerifyBody }>, reply: FastifyReply) => {
    if (!requireTierGate(request, reply, 'FREE')) return;
      try {
        await onboardingService.verify(request.body.email, request.body.code);
        return reply.send({ verified: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Verification failed';
        const status = message.includes('expired') ? 410 : 400;
        return reply.code(status).send({ error: message });
      }
    }
  );

  /**
   * POST /activate
   * Body: { email }
   * Returns: { licenseKey, tier, apiInstructions }
   */
  fastify.post(
    '/activate',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: ActivateBody }>, reply: FastifyReply) => {
    if (!requireTierGate(request, reply, 'FREE')) return;
      try {
        const result = await onboardingService.activate(request.body.email);
        return reply.code(201).send(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Activation failed';
        const status = message.includes('expired') ? 410
          : message.includes('not verified') ? 403
          : 400;
        return reply.code(status).send({ error: message });
      }
    }
  );
}
