/**
 * AI Decision Audit API Routes — Integration Tests
 *
 * Covers the three routes on the default-exported router:
 * POST /decisions, GET /decisions, GET /decisions/:id — the requireTier +
 * authenticate gate, zod 400s, the 404 not-found, and the success paths.
 *
 * The AI decision repository and auth-server are mocked so the routes'
 * branching (auth, validation, repo calls) is exercised without a DB or a
 * real Better Auth session. requireTier runs as a passthrough.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import request from 'supertest';

const recordDecisionMock = vi.hoisted(() => vi.fn());
const recordMetadataMock = vi.hoisted(() => vi.fn());
const getDecisionsMock = vi.hoisted(() => vi.fn());
const countDecisionsMock = vi.hoisted(() => vi.fn());
const getDecisionWithMetadataMock = vi.hoisted(() => vi.fn());
const getSessionMock = vi.hoisted(() => vi.fn());
const loggerInfoMock = vi.hoisted(() => vi.fn());
const loggerErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../../src/platform/audit/ai-decision-repository', () => ({
  getAIDecisionRepository: () => ({
    recordDecision: recordDecisionMock,
    recordMetadata: recordMetadataMock,
    getDecisions: getDecisionsMock,
    countDecisions: countDecisionsMock,
    getDecisionWithMetadata: getDecisionWithMetadataMock,
  }),
}));

vi.mock('../../../../../src/platform/auth/auth-server', () => ({
  auth: { api: { getSession: getSessionMock } },
}));

vi.mock('../../../../../src/platform/middleware/feature-gate', () => ({
  requireTier: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../../../../src/shared/utils/logger', () => ({
  logger: { info: loggerInfoMock, warn: vi.fn(), error: loggerErrorMock, debug: vi.fn() },
}));

import router from '../../../../../src/platform/api/routes/ai-audit-routes';

function app(): Express {
  const a = express();
  a.use(express.json());
  a.use(router);
  return a;
}

function authed(req: request.Test): request.Test {
  getSessionMock.mockResolvedValue({ user: { id: 'u-1' } });
  return req;
}

const VALID_DECISION = {
  model_name: 'gpt-4o',
  input_hash: 'hash-123',
  output: { action: 'buy' },
  confidence: 0.9,
  latency_ms: 120,
};

describe('aiAuditRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordMetadataMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('authenticate gate', () => {
    it('returns 401 when there is no valid session', async () => {
      getSessionMock.mockResolvedValue(null);

      const res = await request(app()).get('/decisions');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
      expect(getDecisionsMock).not.toHaveBeenCalled();
    });

    it('returns 401 when getSession throws', async () => {
      getSessionMock.mockRejectedValue(new Error('auth down'));

      const res = await request(app()).get('/decisions');

      expect(res.status).toBe(401);
      expect(getDecisionsMock).not.toHaveBeenCalled();
    });
  });

  describe('POST /decisions', () => {
    it('returns 400 for an invalid body', async () => {
      const res = await authed(request(app()).post('/decisions')).send({ model_name: 'x' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid request');
      expect(res.body.details).toBeDefined();
      expect(recordDecisionMock).not.toHaveBeenCalled();
    });

    it('records a decision and returns 201 with the decision', async () => {
      recordDecisionMock.mockResolvedValue({ id: 'd-1', ...VALID_DECISION });

      const res = await authed(request(app()).post('/decisions')).send(VALID_DECISION);

      expect(res.status).toBe(201);
      expect(res.body.decision).toMatchObject({ id: 'd-1', model_name: 'gpt-4o' });
      expect(recordDecisionMock).toHaveBeenCalledWith(
        expect.objectContaining({ model_name: 'gpt-4o', confidence: 0.9 }),
      );
      expect(recordMetadataMock).not.toHaveBeenCalled();
      expect(loggerInfoMock).toHaveBeenCalledWith('[AI-Audit] Decision recorded', expect.anything());
    });

    it('persists metadata entries when provided', async () => {
      recordDecisionMock.mockResolvedValue({ id: 'd-1', ...VALID_DECISION });

      const res = await authed(request(app()).post('/decisions')).send({
        ...VALID_DECISION,
        metadata: { tenant: 't-1', region: 'us' },
      });

      expect(res.status).toBe(201);
      expect(recordMetadataMock).toHaveBeenCalledTimes(2);
      expect(recordMetadataMock).toHaveBeenCalledWith('d-1', 'tenant', 't-1');
      expect(recordMetadataMock).toHaveBeenCalledWith('d-1', 'region', 'us');
    });

    it('skips the metadata write when metadata is an empty object', async () => {
      recordDecisionMock.mockResolvedValue({ id: 'd-1', ...VALID_DECISION });

      const res = await authed(request(app()).post('/decisions')).send({
        ...VALID_DECISION,
        metadata: {},
      });

      expect(res.status).toBe(201);
      expect(recordMetadataMock).not.toHaveBeenCalled();
    });

    it('returns 500 when the repo throws', async () => {
      recordDecisionMock.mockRejectedValue(new Error('db down'));

      const res = await authed(request(app()).post('/decisions')).send(VALID_DECISION);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to record decision');
      expect(loggerErrorMock).toHaveBeenCalledWith('[AI-Audit] Failed to record decision', expect.anything());
    });
  });

  describe('GET /decisions', () => {
    it('returns 400 for invalid query params', async () => {
      const res = await authed(request(app()).get('/decisions?min_confidence=5&limit=notnum'));

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid query parameters');
      expect(getDecisionsMock).not.toHaveBeenCalled();
    });

    it('returns 400 for a malformed date string', async () => {
      const res = await authed(request(app()).get('/decisions?start_date=not-a-date'));

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid query parameters');
      expect(getDecisionsMock).not.toHaveBeenCalled();
    });

    it('returns 500 when the repo throws while listing', async () => {
      getDecisionsMock.mockRejectedValue(new Error('db down'));

      const res = await authed(request(app()).get('/decisions'));

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to list decisions');
      expect(loggerErrorMock).toHaveBeenCalledWith('[AI-Audit] Failed to list decisions', expect.anything());
    });

    it('lists decisions with default pagination when no params are given', async () => {
      getDecisionsMock.mockResolvedValue([{ id: 'd-1' }, { id: 'd-2' }]);
      countDecisionsMock.mockResolvedValue(10);

      const res = await authed(request(app()).get('/decisions'));

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(10);
      expect(res.body.limit).toBe(100);
      expect(res.body.offset).toBe(0);
      expect(res.body.hasMore).toBe(true);
      expect(res.body.decisions).toHaveLength(2);
      expect(getDecisionsMock).toHaveBeenCalledWith({ limit: 100, offset: 0 });
    });

    it('computes hasMore=false on the last page', async () => {
      getDecisionsMock.mockResolvedValue([{ id: 'd-1' }]);
      countDecisionsMock.mockResolvedValue(1);

      const res = await authed(request(app()).get('/decisions'));

      expect(res.status).toBe(200);
      expect(res.body.hasMore).toBe(false);
    });

    it('forwards string filters (model, date range) to the repository', async () => {
      getDecisionsMock.mockResolvedValue([]);
      countDecisionsMock.mockResolvedValue(0);

      const res = await authed(request(app()).get('/decisions').query({
        model_name: 'Claude-Fable',
        start_date: '2026-01-01T00:00:00.000Z',
        end_date: '2026-12-31T00:00:00.000Z',
      }));

      expect(res.status).toBe(200);
      expect(getDecisionsMock).toHaveBeenCalledWith(expect.objectContaining({
        model_name: 'Claude-Fable',
        start_date: '2026-01-01T00:00:00.000Z',
        end_date: '2026-12-31T00:00:00.000Z',
        limit: 100,
        offset: 0,
      }));
    });
  });

  describe('GET /decisions/:id', () => {
    it('returns 404 when the decision is not found', async () => {
      getDecisionWithMetadataMock.mockResolvedValue(null);

      const res = await authed(request(app()).get('/decisions/missing'));

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not Found');
      expect(res.body.message).toContain('missing');
    });

    it('returns the decision with its metadata', async () => {
      getDecisionWithMetadataMock.mockResolvedValue({
        id: 'd-1',
        model_name: 'gpt-4o',
        metadata: [{ key: 'tenant', value: 't-1' }],
      });

      const res = await authed(request(app()).get('/decisions/d-1'));

      expect(res.status).toBe(200);
      expect(res.body.decision.id).toBe('d-1');
      expect(res.body.decision.metadata).toHaveLength(1);
    });

    it('returns 500 when the repo throws', async () => {
      getDecisionWithMetadataMock.mockRejectedValue(new Error('db down'));

      const res = await authed(request(app()).get('/decisions/d-1'));

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to get decision');
      expect(loggerErrorMock).toHaveBeenCalledWith('[AI-Audit] Failed to get decision', expect.anything());
    });
  });
});
