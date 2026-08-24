import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { personalizationRouter } from '../personalization-routes';

// ── Hoisted virtual filesystem ──────────────────────────────────────────────
const {
  vfs,
  mockExistsSync,
  mockMkdirSync,
  mockWriteFileSync,
  mockReadFileSync,
  mockReaddirSync,
} = vi.hoisted(() => ({
  vfs: new Map<string, string>(),
  mockExistsSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockReaddirSync: vi.fn(),
}));

// ── Module mocks (hoisted to top by Vitest) ─────────────────────────────────
vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync,
  readdirSync: mockReaddirSync,
}));

vi.mock('../../../shared/tenant', () => ({
  validateTenantId: vi.fn((id: string) => /^[a-z0-9-]+$/i.test(id) && !id.includes('..')),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/personalization', personalizationRouter);
  return app;
}

function dataDirPath(): string {
  return join(process.cwd(), 'data', 'personalization');
}

function seedVfs(filename: string, content: string) {
  vfs.set(join(dataDirPath(), filename), content);
}

function defaultExistsSync(p: unknown): boolean {
  const s = String(p);
  return s.endsWith('personalization') || vfs.has(s);
}

function defaultReadFileSync(p: unknown): string {
  const pathStr = String(p);
  if (vfs.has(pathStr)) return vfs.get(pathStr)!;
  throw new Error(`ENOENT: ${pathStr}`);
}

function defaultReaddirSync(p: unknown): string[] {
  const pathStr = String(p);
  if (pathStr.endsWith('personalization')) {
    return [...vfs.keys()]
      .filter((k) => k.startsWith(dataDirPath()))
      .map((k) => k.split('/').pop()!)
      .filter(Boolean);
  }
  return [];
}

describe('Personalization API Routes', () => {
  beforeEach(() => {
    vfs.clear();
    vi.clearAllMocks();

    // fs: virtual filesystem defaults
    mockExistsSync.mockImplementation(defaultExistsSync);
    mockMkdirSync.mockImplementation(() => {});
    mockWriteFileSync.mockImplementation((p: unknown, data: string) => {
      vfs.set(String(p), String(data));
    });
    mockReadFileSync.mockImplementation(defaultReadFileSync);
    mockReaddirSync.mockImplementation(defaultReaddirSync);
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

      // Verify file written via vfs
      const eventFile = join(dataDirPath(), `events_${tenantId}.json`);
      expect(vfs.has(eventFile)).toBe(true);
      let content = JSON.parse(vfs.get(eventFile)!);
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

      content = JSON.parse(vfs.get(eventFile)!);
      expect(content).toHaveLength(2);
      expect(content[0].eventType).toBe('dashboard_load');
      expect(content[1].eventType).toBe('widget_click');
      expect(content[1].eventData).toEqual({ widget: 'candlestick' });

      // 3. Verify isolation: post to different tenant
      const otherTenant = 'test-tenant-2';
      const otherFile = join(dataDirPath(), `events_${otherTenant}.json`);

      const res3 = await request(buildApp())
        .post('/api/personalization/events')
        .send({
          tenantId: otherTenant,
          eventType: 'upgrade_banner_click'
        });

      expect(res3.status).toBe(201);
      expect(vfs.has(otherFile)).toBe(true);
      const otherContent = JSON.parse(vfs.get(otherFile)!);
      expect(otherContent).toHaveLength(1);
      expect(otherContent[0].eventType).toBe('upgrade_banner_click');

      // Check first tenant file size is unchanged
      content = JSON.parse(vfs.get(eventFile)!);
      expect(content).toHaveLength(2);
    });

    it('blocks directory traversal in tenantId', async () => {
      const res = await request(buildApp())
        .post('/api/personalization/events')
        .send({ tenantId: '../../evil', eventType: 'test_event' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Missing or invalid tenantId' });

      // Verify no file was created with traversal
      const evilPath = join(dataDirPath(), '..', 'events_.._evil.json');
      expect(vfs.has(evilPath)).toBe(false);
    });
  });
});