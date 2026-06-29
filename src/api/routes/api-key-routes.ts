/**
 * API Key Routes
 * Phase 17 - Customer-facing API key management endpoints
 *
 * Endpoints:
 * - POST   /api/v1/keys/generate  — generate new key for a license
 * - POST   /api/v1/keys/rotate    — revoke all old keys + issue new one
 * - DELETE /api/v1/keys/:keyId    — revoke a specific key
 * - GET    /api/v1/keys           — list keys for a license (safe — no full key)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiKeyManager } from '../../billing/api-key-manager';
import { LicenseService } from '../../billing/license-service';
import { LicenseTier } from '../../shared/types/license';

interface GenerateBody {
  licenseId: string;
}

interface RotateBody {
  licenseId: string;
}

interface KeyParams {
  keyId: string;
}

interface ListQuery {
  licenseId: string;
}

/** Resolve tier from license — defaults to FREE if license not found */
function resolveTier(licenseId: string): LicenseTier {
  const licenseService = LicenseService.getInstance();
  const license = licenseService.getLicense(licenseId);
  return license?.tier ?? LicenseTier.FREE;
}

export async function apiKeyRoutes(fastify: FastifyInstance) {
  const manager = ApiKeyManager.getInstance();

  /**
   * POST /api/v1/keys/generate
   * Body: { licenseId: string }
   * Returns: { keyId, prefix, key } — key shown only once
   */
  fastify.post(
    '/generate',
    {
      schema: {
        body: {
          type: 'object',
          required: ['licenseId'],
          properties: {
            licenseId: { type: 'string' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: GenerateBody }>,
      reply: FastifyReply
    ) => {
      const { licenseId } = request.body;

      // Verify license exists
      const license = LicenseService.getInstance().getLicense(licenseId);
      if (!license) {
        return reply.code(404).send({ error: 'Not Found', message: `License ${licenseId} not found` });
      }

      try {
        const { key, apiKey } = manager.generateApiKey(licenseId, resolveTier(licenseId));
        return reply.code(201).send({
          keyId: apiKey.id,
          prefix: apiKey.keyPrefix,
          licenseId: apiKey.licenseId,
          createdAt: apiKey.createdAt,
          key, // ONLY time full key is returned — instruct client to store securely
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to generate key';
        return reply.code(400).send({ error: 'Bad Request', message });
      }
    }
  );

  /**
   * POST /api/v1/keys/rotate
   * Body: { licenseId: string }
   * Revokes ALL active keys for the license, returns one new key
   */
  fastify.post(
    '/rotate',
    {
      schema: {
        body: {
          type: 'object',
          required: ['licenseId'],
          properties: {
            licenseId: { type: 'string' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: RotateBody }>,
      reply: FastifyReply
    ) => {
      const { licenseId } = request.body;

      const license = LicenseService.getInstance().getLicense(licenseId);
      if (!license) {
        return reply.code(404).send({ error: 'Not Found', message: `License ${licenseId} not found` });
      }

      try {
        const { key, apiKey } = manager.rotateApiKey(licenseId, resolveTier(licenseId));
        return reply.code(201).send({
          keyId: apiKey.id,
          prefix: apiKey.keyPrefix,
          licenseId: apiKey.licenseId,
          createdAt: apiKey.createdAt,
          key, // New key — shown once
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to rotate key';
        return reply.code(500).send({ error: 'Internal Server Error', message });
      }
    }
  );

  /**
   * DELETE /api/v1/keys/:keyId
   * Revoke a specific key by ID
   */
  fastify.delete(
    '/:keyId',
    async (
      request: FastifyRequest<{ Params: KeyParams }>,
      reply: FastifyReply
    ) => {
      const { keyId } = request.params;
      const revoked = manager.revokeApiKey(keyId);

      if (!revoked) {
        return reply.code(404).send({ error: 'Not Found', message: `Key ${keyId} not found` });
      }

      return reply.code(200).send({
        keyId: revoked.id,
        licenseId: revoked.licenseId,
        revokedAt: revoked.revokedAt,
        isActive: false,
      });
    }
  );

  /**
   * GET /api/v1/keys?licenseId=...
   * List all keys for a license — prefix + status only, no full key
   */
  fastify.get(
    '/',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['licenseId'],
          properties: {
            licenseId: { type: 'string' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Querystring: ListQuery }>,
      reply: FastifyReply
    ) => {
      const { licenseId } = request.query;

      const license = LicenseService.getInstance().getLicense(licenseId);
      if (!license) {
        return reply.code(404).send({ error: 'Not Found', message: `License ${licenseId} not found` });
      }

      const keys = manager.listApiKeys(licenseId);
      return reply.send({ keys, total: keys.length });
    }
  );
}
