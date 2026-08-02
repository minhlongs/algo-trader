/**
 * Tests for POST /signals-loop/trigger endpoint in admin-qwen-routes.ts
 * Covers: auth, happy path, evaluateAndQueue error.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../db/postgres-client.js', () => ({ query: vi.fn() }));

vi.mock('../../../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { mockEvaluateAndQueue } = vi.hoisted(() => ({ mockEvaluateAndQueue: vi.fn() }));
vi.mock('../../../../wiring/qwen-signals-loop', () => ({ evaluateAndQueue: mockEvaluateAndQueue }));

import { createAdminQwenRouter } from '../admin-qwen-routes.js';

const ADMIN_KEY = 'test-admin-key';

function buildApp() {
 process.env.ADMIN_API_KEY = ADMIN_KEY;
 const app = express();
 app.use(express.json());
 app.use('/qwen', createAdminQwenRouter());
 return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /signals-loop/trigger', () => {
 beforeEach(() => {
  mockEvaluateAndQueue.mockReset();
  mockEvaluateAndQueue.mockResolvedValue(undefined);
 });

 it('returns 401 without admin key', async () => {
  const res = await request(buildApp()).post('/qwen/signals-loop/trigger');
  expect(res.status).toBe(403);
 });

 it('returns 401 with wrong key', async () => {
  const res = await request(buildApp())
   .post('/qwen/signals-loop/trigger')
   .set('x-admin-key', 'bad');
  expect(res.status).toBe(403);
 });

 it('queues evaluateAndQueue with default source and returns 200', async () => {
  const res = await request(buildApp())
   .post('/qwen/signals-loop/trigger')
   .set('x-admin-key', ADMIN_KEY);
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ status: 'queued', source: 'qwen-m1max' });
  expect(mockEvaluateAndQueue).toHaveBeenCalledTimes(1);
  expect(mockEvaluateAndQueue).toHaveBeenCalledWith('qwen-m1max');
 });

 it('propagates evaluateAndQueue error as 500', async () => {
  mockEvaluateAndQueue.mockRejectedValue(new Error('db burst'));
  const res = await request(buildApp())
   .post('/qwen/signals-loop/trigger')
   .set('x-admin-key', ADMIN_KEY);
  expect(res.status).toBe(500);
  expect(res.body.error).toMatch(/Failed to trigger signals loop/);
 });
});
