/**
 * Admin DNA Engine Routes — Integration Tests
 *
 * Covers the four routes on the exported adminDnaRouter: GET /status,
 * GET /journal, POST /paper-mode, POST /journal/clear — the admin-key
 * guard, the 503 not-started path, the zod 400, and the success paths.
 *
 * The DNA orchestrator and paper-executor modules are mocked so the routes'
 * branching (auth, engine-or-error, zod validation, emit) is exercised
 * without booting a real engine. requireAdminKey runs for real against
 * ADMIN_API_KEY set in the test env.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import express from 'express';
import request from 'supertest';

const getDnaEngineMock = vi.hoisted(() => vi.fn());
const onDnaEventMock = vi.hoisted(() => vi.fn());
const emitDnaEventMock = vi.hoisted(() => vi.fn());
const getPaperJournalMock = vi.hoisted(() => vi.fn());
const clearPaperJournalMock = vi.hoisted(() => vi.fn());

vi.mock('@desk/strategies/dna/orchestrator', () => ({
  getDnaEngine: getDnaEngineMock,
  onDnaEvent: onDnaEventMock,
  emitDnaEvent: emitDnaEventMock,
}));

vi.mock('@desk/strategies/dna/paper-executor', () => ({
  getPaperJournal: getPaperJournalMock,
  clearPaperJournal: clearPaperJournalMock,
}));

import { adminDnaRouter } from '../admin-dna';

const ADMIN_KEY = 'test-admin-key-12345';

function app(): Express {
  const a = express();
  a.use(express.json());
  a.use(adminDnaRouter);
  return a;
}

function auth(req: request.Test): request.Test {
  return req.set('x-admin-key', ADMIN_KEY);
}

function makeEngine(overrides: Partial<{ running: boolean; paperMode: boolean }> = {}) {
  const engine = {
    isRunning: overrides.running ?? true,
    paperMode: overrides.paperMode ?? true,
    getLastConsensus: () => ({
      traceId: 'trace-1',
      action: 'enter_long' as const,
      confidence: 0.82,
      regime: 'trending_up' as const,
      emittedAt: 1_700_000_000_000,
    }),
    setPaperMode: vi.fn(function (this: { paperMode: boolean }, enabled: boolean) {
      this.paperMode = enabled;
    }),
  };
  return engine;
}

describe('adminDnaRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    getPaperJournalMock.mockReturnValue([]);
  });

  afterEach(() => {
    delete process.env.ADMIN_API_KEY;
  });

  describe('admin-key guard', () => {
    it('rejects a request with no key (403)', async () => {
      getDnaEngineMock.mockReturnValue(makeEngine());

      const res = await request(app()).get('/status');

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('X-Admin-Key');
      expect(getDnaEngineMock).not.toHaveBeenCalled();
    });

    it('rejects a request with a wrong key (403)', async () => {
      const res = await request(app()).get('/status').set('x-admin-key', 'wrong-key');

      expect(res.status).toBe(403);
      expect(getDnaEngineMock).not.toHaveBeenCalled();
    });

    it('guards every route on the router (403 without a key)', async () => {
      getDnaEngineMock.mockReturnValue(makeEngine());

      const journal = await request(app()).get('/journal');
      const paperMode = await request(app()).post('/paper-mode').send({ enabled: true });
      const clear = await request(app()).post('/journal/clear');

      expect(journal.status).toBe(403);
      expect(paperMode.status).toBe(403);
      expect(clear.status).toBe(403);
      expect(getDnaEngineMock).not.toHaveBeenCalled();
      expect(clearPaperJournalMock).not.toHaveBeenCalled();
    });
  });

  describe('GET /status', () => {
    it('returns 503 when the engine is not started', async () => {
      getDnaEngineMock.mockReturnValue(null);

      const res = await auth(request(app()).get('/status'));

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('DNA engine not started');
    });

    it('returns the engine state summary', async () => {
      getDnaEngineMock.mockReturnValue(makeEngine({ running: true, paperMode: false }));

      const res = await auth(request(app()).get('/status'));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        running: true,
        paperMode: false,
        lastConsensus: {
          traceId: 'trace-1',
          action: 'enter_long',
          confidence: 0.82,
          regime: 'trending_up',
          emittedAt: 1_700_000_000_000,
        },
      });
    });

    it('returns null lastConsensus when the engine has not emitted one yet', async () => {
      const engine = makeEngine();
      engine.getLastConsensus = () => null;
      getDnaEngineMock.mockReturnValue(engine);

      const res = await auth(request(app()).get('/status'));

      expect(res.status).toBe(200);
      expect(res.body.lastConsensus).toBeNull();
    });
  });

  describe('GET /journal', () => {
    it('returns the paginated paper journal (most recent first)', async () => {
      getPaperJournalMock.mockReturnValue([
        { id: 'e1', at: 100 },
        { id: 'e2', at: 200 },
        { id: 'e3', at: 300 },
      ]);

      const res = await auth(request(app()).get('/journal'));

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(3);
      expect(res.body.entries.map((e: { id: string }) => e.id)).toEqual(['e3', 'e2', 'e1']);
    });

    it('honors the limit query param', async () => {
      getPaperJournalMock.mockReturnValue([
        { id: 'e1' }, { id: 'e2' }, { id: 'e3' }, { id: 'e4' }, { id: 'e5' },
      ]);

      const res = await auth(request(app()).get('/journal?limit=2'));

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
      expect(res.body.entries.map((e: { id: string }) => e.id)).toEqual(['e5', 'e4']);
    });

    it('returns 400 for an invalid limit', async () => {
      const res = await auth(request(app()).get('/journal?limit=not-a-number'));

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('POST /paper-mode', () => {
    it('returns 503 when the engine is not started', async () => {
      getDnaEngineMock.mockReturnValue(null);

      const res = await auth(request(app()).post('/paper-mode')).send({ enabled: true });

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('DNA engine not started');
      expect(emitDnaEventMock).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid body', async () => {
      getDnaEngineMock.mockReturnValue(makeEngine());

      const res = await auth(request(app()).post('/paper-mode')).send({ enabled: 'maybe' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(emitDnaEventMock).not.toHaveBeenCalled();
    });

    it('toggles paper mode, emits a tick, and confirms', async () => {
      const engine = makeEngine({ paperMode: true });
      getDnaEngineMock.mockReturnValue(engine);

      const res = await auth(request(app()).post('/paper-mode')).send({ enabled: false });

      expect(res.status).toBe(200);
      expect(engine.setPaperMode).toHaveBeenCalledWith(false);
      expect(emitDnaEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'tick' }));
      expect(res.body.paperMode).toBe(false);
      expect(res.body.message).toBe('paper_mode → false');
    });
  });

  describe('POST /journal/clear', () => {
    it('clears the paper journal and confirms', async () => {
      const res = await auth(request(app()).post('/journal/clear'));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, message: 'paper journal cleared' });
      expect(clearPaperJournalMock).toHaveBeenCalledOnce();
    });
  });
});
