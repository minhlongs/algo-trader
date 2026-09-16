/**
 * Tests for Compliance Routes — Rules & Audit Administration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { buildApp } from './compliance-routes-fixtures';

describe('Compliance Routes - Administration & Audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OFAC_SANCTIONS_ADDRESSES = '0x4f2e9d5f78e3a2b1c0d9e6f5a4b3c2d1e0f9a8b7';
  });

  afterEach(() => {
    delete process.env.OFAC_SANCTIONS_ADDRESSES;
  });

  describe('GET /api/compliance/rules', () => {
    it('returns all rules with enabled status', async () => {
      const res = await request(buildApp()).get('/api/compliance/rules');

      expect(res.status).toBe(200);
      expect(res.body.rules).toBeInstanceOf(Array);
      expect(res.body.rules.length).toBe(9);
      expect(res.body.rules[0]).toHaveProperty('id');
      expect(res.body.rules[0]).toHaveProperty('name');
      expect(res.body.rules[0]).toHaveProperty('enabled');
      expect(res.body.rules[0]).toHaveProperty('severity');
    });

    it('includes AML rules in response', async () => {
      const res = await request(buildApp()).get('/api/compliance/rules');

      const ruleIds = res.body.rules.map((r: { id: string }) => r.id);
      expect(ruleIds).toContain('AML-001');
      expect(ruleIds).toContain('AML-002');
      expect(ruleIds).toContain('AML-003');
      expect(ruleIds).toContain('AML-004');
      expect(ruleIds).toContain('AML-005');
    });
  });

  describe('PUT /api/compliance/rules/:id/toggle', () => {
    it('toggles rule enabled state', async () => {
      const before = await request(buildApp()).get('/api/compliance/rules');
      const aml001 = before.body.rules.find((r: { id: string }) => r.id === 'AML-001');
      const initialState = aml001.enabled;

      const res = await request(buildApp())
        .put('/api/compliance/rules/AML-001/toggle');

      expect(res.status).toBe(200);
      expect(res.body.enabled).toBe(!initialState);
      expect(res.body.id).toBe('AML-001');
    });

    it('returns 404 when rule does not exist', async () => {
      const res = await request(buildApp())
        .put('/api/compliance/rules/INVALID_999/toggle');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });

    it('disabled rule is not applied during validation', async () => {
      await request(buildApp()).put('/api/compliance/rules/AML-004/toggle');

      const res = await request(buildApp())
        .post('/api/compliance/validate')
        .send({
          pair: 'BTC/USDT',
          side: 'buy',
          amount: 1,
          price: 50000,
          counterparty: '0x4f2e9d5f78e3a2b1c0d9e6f5a4b3c2d1e0f9a8b7',
        });

      const ofac = res.body.results.find((r: { ruleId: string }) => r.ruleId === 'AML-004');
      expect(ofac).toBeUndefined();
    });
  });

  describe('GET /api/compliance/audit', () => {
    it('returns audit entries', async () => {
      const res = await request(buildApp()).get('/api/compliance/audit');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('entries');
      expect(res.body.entries).toBeInstanceOf(Array);
    });

    it('audit log populates after blocked trades', async () => {
      await request(buildApp())
        .post('/api/compliance/validate')
        .send({
          pair: 'BTC/USDT',
          side: 'buy',
          amount: 1,
          price: 200000,
          counterparty: '0x4f2e9d5f78e3a2b1c0d9e6f5a4b3c2d1e0f9a8b7',
        });

      const res = await request(buildApp()).get('/api/compliance/audit');

      expect(res.body.entries.length).toBeGreaterThanOrEqual(1);
      expect(res.body.entries[0]).toHaveProperty('ruleId');
      expect(res.body.entries[0]).toHaveProperty('action');
    });
  });
});
