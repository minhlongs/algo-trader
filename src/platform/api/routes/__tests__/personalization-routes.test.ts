import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock tier gating — route tests do not run raas-gate middleware
vi.mock('../../../middleware/feature-gate', () => ({
  requireTier: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireFeature: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  canAccessFeature: () => true,
  FEATURE_ACCESS: {},
}));
import express from 'express';
import request from 'supertest';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { personalizationRouter } from '../personalization-routes';

const DATA_DIR = join(process.cwd(), 'data', 'personalization');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/personalization', personalizationRouter);
  return app;
}

describe('Personalization API Routes', () => {
  beforeEach(() => {
    // Ensure dir exists but remove test files
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up created files
    const testFiles = [
      'events_test-tenant-1.json',
      'events_test-tenant-2.json',
      'events_traversal.json',
      'events_evil.json'
    ];
    for (const file of testFiles) {
      const filePath = join(DATA_DIR, file);
      if (existsSync(filePath)) {
        try {
          rmSync(filePath);
        } catch (err) {
          // ignore
        }
      }
    }
  });

  describe('GET /api/personalization/config', () => {
    it('returns FREE tier configuration by default', async () => {
      const res = await request(buildApp())
        .get('/api/personalization/config');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('widgets');
      expect(res.body).toHaveProperty('features');
      expect(res.body.features.aiInsights).toBe(false);
      expect(res.body.widgets.find((w: any) => w.id === 'strategy-controls')?.visible).toBe(false);
    });

    it('returns PRO tier configuration', async () => {
      const res = await request(buildApp())
        .get('/api/personalization/config?tier=PRO');

      expect(res.status).toBe(200);
      expect(res.body.features.aiInsights).toBe(true);
      expect(res.body.features.customAlerts).toBe(true);
      expect(res.body.widgets.find((w: any) => w.id === 'strategy-controls')?.visible).toBe(true);
      expect(res.body.widgets.find((w: any) => w.id === 'strategy-controls')?.colSpan).toBe(4);
    });

    it('returns ENTERPRISE tier configuration', async () => {
      const res = await request(buildApp())
        .get('/api/personalization/config?tier=ENTERPRISE');

      expect(res.status).toBe(200);
      expect(res.body.features.aiInsights).toBe(true);
      expect(res.body.features.unlimitedStrategies).toBe(true);
      expect(res.body.widgets.find((w: any) => w.id === 'ai-insights-panel')?.visible).toBe(true);
    });

    it('returns 400 for invalid tier parameter', async () => {
      const res = await request(buildApp())
        .get('/api/personalization/config?tier=INVALID');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid tier parameter' });
    });
  });

  describe('GET /api/personalization/ab-config', () => {
    it('returns 400 when tenantId is missing', async () => {
      const res = await request(buildApp())
        .get('/api/personalization/ab-config');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Missing or invalid tenantId' });
    });

    it('returns 400 when tenantId contains invalid characters (LFI attempt)', async () => {
      const res = await request(buildApp())
        .get('/api/personalization/ab-config?tenantId=../../evil');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Missing or invalid tenantId' });
    });

    it('returns deterministic variant A configuration for even sha256 last digit', async () => {
      // Find a tenantId that hashes to variant A (even last char in hex)
      let tenantId = '';
      for (let i = 0; i < 100; i++) {
        const candidate = `tenant-${i}`;
        const hash = crypto.createHash('sha256').update(candidate).digest('hex');
        const lastChar = hash.slice(-1);
        if (parseInt(lastChar, 16) % 2 === 0) {
          tenantId = candidate;
          break;
        }
      }
      expect(tenantId).not.toBe('');

      const res = await request(buildApp())
        .get(`/api/personalization/ab-config?tenantId=${tenantId}`);

      expect(res.status).toBe(200);
      expect(res.body.tenantId).toBe(tenantId);
      expect(res.body.variant).toBe('A');
      expect(res.body.config).toEqual({
        theme: 'default',
        promoBanner: false,
        abTestingEnabled: true,
      });
    });

    it('returns deterministic variant B configuration for odd sha256 last digit', async () => {
      // Find a tenantId that hashes to variant B (odd last char in hex)
      let tenantId = '';
      for (let i = 0; i < 100; i++) {
        const candidate = `tenant-${i}`;
        const hash = crypto.createHash('sha256').update(candidate).digest('hex');
        const lastChar = hash.slice(-1);
        if (parseInt(lastChar, 16) % 2 !== 0) {
          tenantId = candidate;
          break;
        }
      }
      expect(tenantId).not.toBe('');

      const res = await request(buildApp())
        .get(`/api/personalization/ab-config?tenantId=${tenantId}`);

      expect(res.status).toBe(200);
      expect(res.body.tenantId).toBe(tenantId);
      expect(res.body.variant).toBe('B');
      expect(res.body.config).toEqual({
        theme: 'cyberpunk',
        promoBanner: true,
        abTestingEnabled: true,
      });
    });
  });

  describe('POST /api/personalization/events', () => {
    it('returns 400 when tenantId is missing', async () => {
      const res = await request(buildApp())
        .post('/api/personalization/events')
        .send({ eventType: 'test_event' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Missing or invalid tenantId' });
    });

    it('returns 400 when tenantId has traversal characters (LFI prevention)', async () => {
      const res = await request(buildApp())
        .post('/api/personalization/events')
        .send({ tenantId: '../evil', eventType: 'test_event' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Missing or invalid tenantId' });

      // Verify the file was not created outside the boundaries
      const evilPath = join(DATA_DIR, '..', 'events_.._evil.json');
      expect(existsSync(evilPath)).toBe(false);
    });

    it('returns 400 when eventType is missing', async () => {
      const res = await request(buildApp())
        .post('/api/personalization/events')
        .send({ tenantId: 'test-tenant-1' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Missing eventType' });
    });

    it('successfully appends events to tenant-isolated file', async () => {
      const tenantId = 'test-tenant-1';
      const eventFile = join(DATA_DIR, `events_${tenantId}.json`);

      // 1. Post first event
      const res1 = await request(buildApp())
        .post('/api/personalization/events')
        .send({
          tenantId,
          eventType: 'dashboard_load',
          eventData: { screen: 'main' }
        });

      expect(res1.status).toBe(201);
      expect(res1.body.success).toBe(true);
      expect(res1.body.event.eventType).toBe('dashboard_load');
      expect(res1.body.event.eventData).toEqual({ screen: 'main' });
      expect(res1.body.event).toHaveProperty('timestamp');

      // Verify file written
      expect(existsSync(eventFile)).toBe(true);
      let content = JSON.parse(readFileSync(eventFile, 'utf-8'));
      expect(content).toHaveLength(1);
      expect(content[0].eventType).toBe('dashboard_load');
      expect(content[0].eventData).toEqual({ screen: 'main' });

      // 2. Post second event to same tenant
      const res2 = await request(buildApp())
        .post('/api/personalization/events')
        .send({
          tenantId,
          eventType: 'widget_click',
          eventData: { widget: 'candlestick' }
        });

      expect(res2.status).toBe(201);

      content = JSON.parse(readFileSync(eventFile, 'utf-8'));
      expect(content).toHaveLength(2);
      expect(content[0].eventType).toBe('dashboard_load');
      expect(content[1].eventType).toBe('widget_click');
      expect(content[1].eventData).toEqual({ widget: 'candlestick' });

      // 3. Verify isolation: post to different tenant
      const otherTenant = 'test-tenant-2';
      const otherFile = join(DATA_DIR, `events_${otherTenant}.json`);

      const res3 = await request(buildApp())
        .post('/api/personalization/events')
        .send({
          tenantId: otherTenant,
          eventType: 'upgrade_banner_click'
        });

      expect(res3.status).toBe(201);
      expect(existsSync(otherFile)).toBe(true);
      const otherContent = JSON.parse(readFileSync(otherFile, 'utf-8'));
      expect(otherContent).toHaveLength(1);
      expect(otherContent[0].eventType).toBe('upgrade_banner_click');

      // Check first tenant file size is unchanged
      content = JSON.parse(readFileSync(eventFile, 'utf-8'));
      expect(content).toHaveLength(2);
    });
  });
});
