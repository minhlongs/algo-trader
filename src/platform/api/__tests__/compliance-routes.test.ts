/**
 * Tests for Compliance Routes — AML trade validation endpoint
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { buildApp } from './compliance-routes-fixtures';

describe('Compliance Routes - Validation Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OFAC_SANCTIONS_ADDRESSES = '0x4f2e9d5f78e3a2b1c0d9e6f5a4b3c2d1e0f9a8b7';
  });

  afterEach(() => {
    delete process.env.OFAC_SANCTIONS_ADDRESSES;
  });

  describe('POST /api/compliance/validate', () => {
    it('returns 200 with passed=true when trade is within all limits', async () => {
      const res = await request(buildApp())
        .post('/api/compliance/validate')
        .send({
          pair: 'BTC/USDT',
          side: 'buy',
          amount: 0.1,
          price: 50000,
          counterparty: '0x1234567890abcdef1234567890abcdef12345678',
        });

      expect(res.status).toBe(200);
      expect(res.body.passed).toBe(true);
      expect(res.body.results.length).toBeGreaterThan(0);
    });

    it('returns 200 with passed=false when trade exceeds $10,000 AML threshold', async () => {
      const res = await request(buildApp())
        .post('/api/compliance/validate')
        .send({
          pair: 'BTC/USDT',
          side: 'buy',
          amount: 1,
          price: 15000,
          counterparty: '0x1234567890abcdef1234567890abcdef12345678',
        });

      expect(res.status).toBe(200);
      expect(res.body.passed).toBe(false);
      const aml001 = res.body.results.find((r: { ruleId: string }) => r.ruleId === 'AML-001');
      expect(aml001).toBeDefined();
      expect(aml001.passed).toBe(false);
    });

    it('returns 400 when body is missing required fields', async () => {
      const res = await request(buildApp())
        .post('/api/compliance/validate')
        .send({ pair: 'BTC/USDT' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
    });

    it('returns 400 when amount is negative', async () => {
      const res = await request(buildApp())
        .post('/api/compliance/validate')
        .send({
          pair: 'BTC/USDT',
          side: 'buy',
          amount: -1,
          price: 50000,
          counterparty: '0x1234567890abcdef1234567890abcdef12345678',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
    });

    it('detects OFAC-sanctioned counterparty', async () => {
      const sanctionedAddr = '0x4f2e9d5f78e3a2b1c0d9e6f5a4b3c2d1e0f9a8b7';
      const res = await request(buildApp())
        .post('/api/compliance/validate')
        .send({
          pair: 'BTC/USDT',
          side: 'buy',
          amount: 1,
          price: 50000,
          counterparty: sanctionedAddr,
        });

      expect(res.status).toBe(200);
      expect(res.body.passed).toBe(false);
      const ofac = res.body.results.find((r: { ruleId: string }) => r.ruleId === 'AML-004');
      expect(ofac).toBeDefined();
      expect(ofac.passed).toBe(false);
      expect(ofac.message).toContain('OFAC SDN list');
    });

    it('flags cross-border transfer to high-risk jurisdiction', async () => {
      const res = await request(buildApp())
        .post('/api/compliance/validate')
        .send({
          pair: 'BTC/USDT',
          side: 'buy',
          amount: 1,
          price: 50000,
          counterparty: '0x1234567890abcdef1234567890abcdef12345678',
          destinationJurisdiction: 'IR',
        });

      expect(res.status).toBe(200);
      expect(res.body.passed).toBe(false);
      const crossBorder = res.body.results.find((r: { ruleId: string }) => r.ruleId === 'AML-005');
      expect(crossBorder).toBeDefined();
      expect(crossBorder.passed).toBe(false);
    });

    it('flags suspicious rapid buy-sell-sell-buy pattern', async () => {
      const now = Date.now();
      const res = await request(buildApp())
        .post('/api/compliance/validate')
        .send({
          pair: 'ETH/USDT',
          side: 'buy',
          amount: 1,
          price: 3000,
          counterparty: '0x1234567890abcdef1234567890abcdef12345678',
          recentTrades: [
            { action: 'buy', timestamp: now - 50000 },
            { action: 'sell', timestamp: now - 40000 },
            { action: 'sell', timestamp: now - 30000 },
          ],
        });

      expect(res.status).toBe(200);
      const pattern = res.body.results.find((r: { ruleId: string }) => r.ruleId === 'AML-003');
      expect(pattern).toBeDefined();
      expect(pattern.passed).toBe(false);
    });

    it('flags daily velocity when counterparty exceeds $50,000', async () => {
      const res = await request(buildApp())
        .post('/api/compliance/validate')
        .send({
          pair: 'BTC/USDT',
          side: 'buy',
          amount: 1,
          price: 10000,
          counterparty: '0x1234567890abcdef1234567890abcdef12345678',
          counterpartyDailyTotal: 45000,
        });

      expect(res.status).toBe(200);
      expect(res.body.passed).toBe(false);
      const velocity = res.body.results.find((r: { ruleId: string }) => r.ruleId === 'AML-002');
      expect(velocity).toBeDefined();
      expect(velocity.passed).toBe(false);
    });
  });
});
