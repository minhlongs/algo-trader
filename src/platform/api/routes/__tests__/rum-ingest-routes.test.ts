import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  observe: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../middleware/prometheus-metrics', () => ({
  externalApiLatency: { observe: mocks.observe },
}));

vi.mock('../../../utils/logger', () => ({
  logger: { info: mocks.info, error: mocks.error, warn: vi.fn(), debug: vi.fn() },
}));

import { rumRouter } from '../rum-ingest-routes';

function buildApp(cf?: { colo: string }) {
  const app = express();
  app.use(express.json());
  app.use((req: express.Request, _res, next) => {
    if (cf) {
      (req as unknown as { cf?: { colo: string } }).cf = cf;
    }
    next();
  });
  app.use('/', rumRouter);
  return app;
}

const baseMetric = (name: string) => ({ name, duration: 100, timestamp: Date.now() });

describe('rum-ingest-routes', () => {
  beforeEach(() => {
    mocks.observe.mockReset();
    mocks.info.mockReset();
    mocks.error.mockReset();
  });

  it('returns 400 when sessionId is missing', async () => {
    const res = await request(buildApp()).post('/ingest').send({ metrics: [baseMetric('m')] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid payload');
  });

  it('returns 400 when metrics is not an array', async () => {
    const res = await request(buildApp()).post('/ingest').send({ sessionId: 's', metrics: 'nope' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when metrics array is empty', async () => {
    const res = await request(buildApp()).post('/ingest').send({ sessionId: 's', metrics: [] });
    expect(res.status).toBe(400);
  });

  it('ingests metrics: sanitizes userId, observes prometheus per metric, logs, returns 202', async () => {
    const payload = {
      sessionId: 'sess-1',
      userId: 'user-abc',
      sampleRate: 1,
      metrics: [
        { name: 'page_load', duration: 500, url: '/x', type: 'navigation', timestamp: Date.now() },
        { name: 'api_call', duration: 200, timestamp: Date.now() },
      ],
      timestamp: Date.now(),
      userAgent: 'ua',
    };
    const res = await request(buildApp({ colo: 'ewr' })).post('/ingest').send(payload);

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: 'accepted', processed: 2, timeMs: expect.any(Number) });
    expect(mocks.observe).toHaveBeenCalledTimes(2);
    expect(mocks.observe).toHaveBeenCalledWith({ service: 'rum', endpoint: 'page_load', region: 'ewr' }, 0.5);
    expect(mocks.observe).toHaveBeenCalledWith({ service: 'rum', endpoint: 'api_call', region: 'ewr' }, 0.2);
    expect(mocks.info).toHaveBeenCalledWith('[RUM] Ingested metrics', expect.objectContaining({
      sessionId: 'sess-1',
      userId: expect.stringMatching(/^user_[0-9a-f]{16}$/),
      metricCount: 2,
    }));
  });

  it('omits userId sanitization when userId absent and falls back region to unknown', async () => {
    const payload = { sessionId: 's', metrics: [baseMetric('m')], timestamp: Date.now() };
    const res = await request(buildApp()).post('/ingest').send(payload);

    expect(res.status).toBe(202);
    expect(mocks.info).toHaveBeenCalledWith('[RUM] Ingested metrics', expect.objectContaining({ userId: undefined }));
    expect(mocks.observe).toHaveBeenCalledWith({ service: 'rum', endpoint: 'm', region: 'unknown' }, 0.1);
  });

  it('best-effort: returns 202 with error body when observe throws', async () => {
    mocks.observe.mockImplementation(() => { throw new Error('prom down'); });
    const payload = { sessionId: 's', metrics: [baseMetric('m')], timestamp: Date.now() };
    const res = await request(buildApp()).post('/ingest').send(payload);

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: 'accepted', error: 'processing error' });
    expect(mocks.error).toHaveBeenCalledWith('[RUM] Ingest error', { error: expect.any(Error) });
  });
});