/**
 * Trial Drip Campaign Routes — Integration Tests
 *
 * Covers the five routes on the exported trialDripRouter: POST /subscribe,
 * POST /unsubscribe, POST /process, GET /status, GET /subscriber/:id — the
 * validation 400s, the not-found 404s, the success paths, and the defensive
 * 500 paths.
 *
 * TrialDripService, logger, and requireTier are mocked; the router is mounted
 * in a fresh express app per call because supertest cannot drive a bare
 * Router.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import request from 'supertest';

const subscribeMock = vi.hoisted(() => vi.fn());
const unsubscribeMock = vi.hoisted(() => vi.fn());
const processDueEmailsMock = vi.hoisted(() => vi.fn());
const getStateMock = vi.hoisted(() => vi.fn());
const getSubscriberMock = vi.hoisted(() => vi.fn());
const loggerErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../../../billing/trial-drip-service', () => ({
  TrialDripService: {
    getInstance: () => ({
      subscribe: subscribeMock,
      unsubscribe: unsubscribeMock,
      processDueEmails: processDueEmailsMock,
      getState: getStateMock,
      getSubscriber: getSubscriberMock,
    }),
  },
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: loggerErrorMock, debug: vi.fn() },
}));

vi.mock('../../../middleware/feature-gate', () => ({
  requireTier: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import { trialDripRouter } from '../trial-drip-routes';

function app(): Express {
  const a = express();
  a.use(express.json());
  a.use(trialDripRouter);
  return a;
}

const SUBSCRIBER = {
  email: 'trader@example.com',
  tenantId: 't-1',
  tier: 'PRO',
  subscribedAt: '2026-08-31T00:00:00.000Z',
  trialEndsAt: '2026-09-07T00:00:00.000Z',
  daysSinceTrialStart: 0,
  lastEmailDay: 0,
  isActive: true,
};

describe('trialDripRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /subscribe', () => {
    it('returns 400 when required fields are missing', async () => {
      const res = await request(app()).post('/subscribe').send({ email: 'trader@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing required fields: email, tenantId, tier');
      expect(subscribeMock).not.toHaveBeenCalled();
    });

    it('registers a subscriber and returns 201 with the subscriber', async () => {
      subscribeMock.mockReturnValue(SUBSCRIBER);

      const res = await request(app())
        .post('/subscribe')
        .send({ email: 'trader@example.com', tenantId: 't-1', tier: 'PRO', trialDays: 7 });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ data: SUBSCRIBER });
      expect(subscribeMock).toHaveBeenCalledWith('trader@example.com', 't-1', 'PRO', 7);
    });

    it('returns 500 when the service throws', async () => {
      subscribeMock.mockImplementation(() => {
        throw new Error('persist failed');
      });

      const res = await request(app())
        .post('/subscribe')
        .send({ email: 'trader@example.com', tenantId: 't-1', tier: 'PRO' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to subscribe to drip campaign');
      expect(loggerErrorMock).toHaveBeenCalledWith('[TrialDrip] Subscribe error:', { error: 'Error: persist failed' });
    });
  });

  describe('POST /unsubscribe', () => {
    it('returns 400 when tenantId is missing', async () => {
      const res = await request(app()).post('/unsubscribe').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing required field: tenantId');
      expect(unsubscribeMock).not.toHaveBeenCalled();
    });

    it('returns 404 when the subscriber is not found', async () => {
      unsubscribeMock.mockReturnValue(false);

      const res = await request(app()).post('/unsubscribe').send({ tenantId: 'missing' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Subscriber not found');
      expect(unsubscribeMock).toHaveBeenCalledWith('missing');
    });

    it('unsubscribes and returns success', async () => {
      unsubscribeMock.mockReturnValue(true);

      const res = await request(app()).post('/unsubscribe').send({ tenantId: 't-1' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(unsubscribeMock).toHaveBeenCalledWith('t-1');
    });

    it('returns 500 when the service throws', async () => {
      unsubscribeMock.mockImplementation(() => {
        throw new Error('persist failed');
      });

      const res = await request(app()).post('/unsubscribe').send({ tenantId: 't-1' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to unsubscribe');
      expect(loggerErrorMock).toHaveBeenCalledWith('[TrialDrip] Unsubscribe error:', {
        error: 'Error: persist failed',
      });
    });
  });

  describe('POST /process', () => {
    it('processes due emails and returns the summary', async () => {
      processDueEmailsMock.mockResolvedValue({ sent: 2, skipped: 1, errors: 0 });

      const res = await request(app()).post('/process');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ sent: 2, skipped: 1, errors: 0 });
      expect(processDueEmailsMock).toHaveBeenCalledOnce();
    });

    it('returns 500 when the service throws', async () => {
      processDueEmailsMock.mockRejectedValue(new Error('email down'));

      const res = await request(app()).post('/process');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to process drip emails');
      expect(loggerErrorMock).toHaveBeenCalledWith('[TrialDrip] Process error:', { error: 'Error: email down' });
    });
  });

  describe('GET /status', () => {
    it('returns the campaign state summary', async () => {
      getStateMock.mockReturnValue({ activeSubscribers: 3, totalSubscribers: 5 });

      const res = await request(app()).get('/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ activeSubscribers: 3, totalSubscribers: 5 });
      expect(getStateMock).toHaveBeenCalledOnce();
    });

    it('returns 500 when the service throws', async () => {
      getStateMock.mockImplementation(() => {
        throw new Error('state unreadable');
      });

      const res = await request(app()).get('/status');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to get campaign state');
      expect(loggerErrorMock).toHaveBeenCalledWith('[TrialDrip] Status error:', {
        error: 'Error: state unreadable',
      });
    });
  });

  describe('GET /subscriber/:id', () => {
    it('returns 404 when the subscriber is not found', async () => {
      getSubscriberMock.mockReturnValue(undefined);

      const res = await request(app()).get('/subscriber/missing');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Subscriber not found');
      expect(getSubscriberMock).toHaveBeenCalledWith('missing');
    });

    it('returns the subscriber details', async () => {
      getSubscriberMock.mockReturnValue(SUBSCRIBER);

      const res = await request(app()).get('/subscriber/t-1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: SUBSCRIBER });
      expect(getSubscriberMock).toHaveBeenCalledWith('t-1');
    });

    it('returns 500 when the service throws', async () => {
      getSubscriberMock.mockImplementation(() => {
        throw new Error('lookup failed');
      });

      const res = await request(app()).get('/subscriber/t-1');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to get subscriber');
      expect(loggerErrorMock).toHaveBeenCalledWith('[TrialDrip] Get subscriber error:', {
        error: 'Error: lookup failed',
      });
    });
  });
});
