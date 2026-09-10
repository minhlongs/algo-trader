/**
 * Tests for analytics-routes — Express router for referral/conversion analytics.
 * Covers POST /event (beacon ingestion) and GET /referrals (admin summary).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock persistent-store
const readJsonMock = vi.fn();
const writeJsonMock = vi.fn();

vi.mock('../../../../../src/shared/persistence/persistent-store', () => ({
  readJson: (...args: unknown[]) => readJsonMock(...args),
  writeJson: (...args: unknown[]) => writeJsonMock(...args),
}));

// Mock logger
vi.mock('../../../../../src/shared/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock feature-gate middleware to pass through (we test tier logic elsewhere)
vi.mock('../../../../../src/platform/middleware/feature-gate', () => ({
  requireTier: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { analyticsRouter } from '../../../../../src/platform/api/routes/analytics-routes';

describe('analytics-routes', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();

    app = express();
    app.use(express.json({ limit: '1mb' }));
    app.use('/api/analytics', analyticsRouter);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('POST /event', () => {
    it('accepts a valid event and returns 204', async () => {
      readJsonMock.mockReturnValue([]);
      writeJsonMock.mockImplementation(() => {});

      const res = await request(app)
        .post('/api/analytics/event')
        .send({ event: 'page_view', ref: 'REF123', utm: { source: 'google', medium: 'cpc', campaign: 'summer' }, url: 'https://example.com/' })
        .expect(204);

      expect(readJsonMock).toHaveBeenCalledOnce();
      expect(writeJsonMock).toHaveBeenCalledOnce();
      const savedEvents = writeJsonMock.mock.calls[0]![1] as Array<{ event: string; ref: string }>;
      expect(savedEvents).toHaveLength(1);
      expect(savedEvents[0].event).toBe('page_view');
      expect(savedEvents[0].ref).toBe('REF123');
    });

    it('rejects payload missing event field with 400', async () => {
      readJsonMock.mockReturnValue([]);
      writeJsonMock.mockImplementation(() => {});

      await request(app)
        .post('/api/analytics/event')
        .send({ ref: 'REF123' })
        .expect(400);

      expect(writeJsonMock).not.toHaveBeenCalled();
    });

    it('handles string body (JSON.parse via text middleware)', async () => {
      readJsonMock.mockReturnValue([]);
      writeJsonMock.mockImplementation(() => {});

      // Re-create app with text body parser to simulate raw/string body mode
      const textApp = express();
      textApp.use(express.text({ type: '*/*' }));
      textApp.use('/api/analytics', analyticsRouter);

      await request(textApp)
        .post('/api/analytics/event')
        .set('Content-Type', 'text/plain')
        .send('{"event":"click","ref":"REF456"}')
        .expect(204);

      const savedEvents = writeJsonMock.mock.calls[0]![1] as Array<{ event: string; ref: string }>;
      expect(savedEvents[0].event).toBe('click');
      expect(savedEvents[0].ref).toBe('REF456');
    });

    it('truncates event field to 100 chars', async () => {
      readJsonMock.mockReturnValue([]);
      writeJsonMock.mockImplementation(() => {});

      const longEvent = 'e'.repeat(150);
      await request(app)
        .post('/api/analytics/event')
        .send({ event: longEvent, ref: 'REF123' })
        .expect(204);

      const savedEvents = writeJsonMock.mock.calls[0]![1] as Array<{ event: string }>;
      expect(savedEvents[0].event).toHaveLength(100);
    });

    it('truncates ref field to 50 chars', async () => {
      readJsonMock.mockReturnValue([]);
      writeJsonMock.mockImplementation(() => {});

      const longRef = 'r'.repeat(100);
      await request(app)
        .post('/api/analytics/event')
        .send({ event: 'view', ref: longRef })
        .expect(204);

      const savedEvents = writeJsonMock.mock.calls[0]![1] as Array<{ ref: string }>;
      expect(savedEvents[0].ref).toHaveLength(50);
    });

    it('truncates utm fields to 100 chars each', async () => {
      readJsonMock.mockReturnValue([]);
      writeJsonMock.mockImplementation(() => {});

      const longSource = 's'.repeat(150);
      const longMedium = 'm'.repeat(150);
      const longCampaign = 'c'.repeat(150);
      await request(app)
        .post('/api/analytics/event')
        .send({ event: 'view', ref: 'REF123', utm: { source: longSource, medium: longMedium, campaign: longCampaign } })
        .expect(204);

      const savedEvents = writeJsonMock.mock.calls[0]![1] as Array<{ utm: { source: string; medium: string; campaign: string } }>;
      expect(savedEvents[0].utm!.source).toHaveLength(100);
      expect(savedEvents[0].utm!.medium).toHaveLength(100);
      expect(savedEvents[0].utm!.campaign).toHaveLength(100);
    });

    it('handles missing utm (sets to null)', async () => {
      readJsonMock.mockReturnValue([]);
      writeJsonMock.mockImplementation(() => {});

      await request(app)
        .post('/api/analytics/event')
        .send({ event: 'view', ref: 'REF123' })
        .expect(204);

      const savedEvents = writeJsonMock.mock.calls[0]![1] as Array<{ utm: unknown }>;
      expect(savedEvents[0].utm).toBeNull();
    });

    it('truncates url to 200 chars', async () => {
      readJsonMock.mockReturnValue([]);
      writeJsonMock.mockImplementation(() => {});

      const longUrl = 'u'.repeat(300);
      await request(app)
        .post('/api/analytics/event')
        .send({ event: 'view', ref: 'REF123', url: longUrl })
        .expect(204);

      const savedEvents = writeJsonMock.mock.calls[0]![1] as Array<{ url: string }>;
      expect(savedEvents[0].url).toHaveLength(200);
    });

    it('handles invalid JSON in string body with 400', async () => {
      readJsonMock.mockReturnValue([]);
      writeJsonMock.mockImplementation(() => {});

      await request(app)
        .post('/api/analytics/event')
        .set('Content-Type', 'text/plain')
        .send('not valid json')
        .expect(400);

      expect(writeJsonMock).not.toHaveBeenCalled();
    });

    it('limits stored events to last 1000', async () => {
      const existingEvents = Array.from({ length: 1005 }, (_, i) => ({ event: 'old', ref: `R${i}` }));
      readJsonMock.mockReturnValue(existingEvents);
      writeJsonMock.mockImplementation(() => {});

      await request(app)
        .post('/api/analytics/event')
        .send({ event: 'new', ref: 'REF123' })
        .expect(204);

      const savedEvents = writeJsonMock.mock.calls[0]![1] as Array<{ event: string }>;
      expect(savedEvents.length).toBe(1000);
      // Should keep the last 999 old events + 1 new
      expect(savedEvents[0].event).toBe('old');
      expect(savedEvents[savedEvents.length - 1].event).toBe('new');
    });
  });

  describe('GET /referrals', () => {
    it('returns 403 when METRICS_TOKEN not configured', async () => {
      vi.stubEnv('METRICS_TOKEN', '');
      readJsonMock.mockReturnValue([]);

      await request(app)
        .get('/api/analytics/referrals')
        .expect(403);
    });

    it('returns 403 when auth header missing', async () => {
      vi.stubEnv('METRICS_TOKEN', 'secret-token');
      readJsonMock.mockReturnValue([]);

      await request(app)
        .get('/api/analytics/referrals')
        .expect(403);
    });

    it('returns 403 when token does not match', async () => {
      vi.stubEnv('METRICS_TOKEN', 'secret-token');
      readJsonMock.mockReturnValue([]);

      await request(app)
        .get('/api/analytics/referrals')
        .set('Authorization', 'Bearer wrong-token')
        .expect(403);
    });

    it('returns referral summary when token matches', async () => {
      vi.stubEnv('METRICS_TOKEN', 'secret-token');
      readJsonMock.mockReturnValue([
        { event: 'view', ref: 'REF1', utm: null, url: '/', ts: 1 },
        { event: 'click', ref: 'REF1', utm: null, url: '/', ts: 2 },
        { event: 'view', ref: 'REF2', utm: null, url: '/', ts: 3 },
        { event: 'view', ref: '', utm: null, url: '/', ts: 4 }, // no ref
      ]);

      const res = await request(app)
        .get('/api/analytics/referrals')
        .set('Authorization', 'Bearer secret-token')
        .expect(200);

      expect(res.body).toEqual({
        total: 4,
        referrals: [
          { ref: 'REF1', count: 2 },
          { ref: 'REF2', count: 1 },
        ],
      });
    });

    it('handles empty events array', async () => {
      vi.stubEnv('METRICS_TOKEN', 'secret-token');
      readJsonMock.mockReturnValue([]);

      const res = await request(app)
        .get('/api/analytics/referrals')
        .set('Authorization', 'Bearer secret-token')
        .expect(200);

      expect(res.body).toEqual({ total: 0, referrals: [] });
    });

    it('sorts referrals by count descending', async () => {
      vi.stubEnv('METRICS_TOKEN', 'secret-token');
      readJsonMock.mockReturnValue([
        { event: 'view', ref: 'REF1', utm: null, url: '/', ts: 1 },
        { event: 'view', ref: 'REF2', utm: null, url: '/', ts: 2 },
        { event: 'view', ref: 'REF2', utm: null, url: '/', ts: 3 },
        { event: 'view', ref: 'REF3', utm: null, url: '/', ts: 4 },
        { event: 'view', ref: 'REF3', utm: null, url: '/', ts: 5 },
        { event: 'view', ref: 'REF3', utm: null, url: '/', ts: 6 },
      ]);

      const res = await request(app)
        .get('/api/analytics/referrals')
        .set('Authorization', 'Bearer secret-token')
        .expect(200);

      expect(res.body.referrals).toEqual([
        { ref: 'REF3', count: 3 },
        { ref: 'REF2', count: 2 },
        { ref: 'REF1', count: 1 },
      ]);
    });
  });
});