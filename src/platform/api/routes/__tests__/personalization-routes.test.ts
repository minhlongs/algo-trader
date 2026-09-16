/**
 * Personalization Routes Tests — Config & A/B Config
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { buildApp, dataDirPath, setupVfsDefaults, type VfsState } from './personalization-routes.fixtures';

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

const state: VfsState = { vfs, mockExistsSync, mockMkdirSync, mockWriteFileSync, mockReadFileSync, mockReaddirSync };

describe('Personalization API Routes — Config & A/B Config', () => {
  beforeEach(() => {
    vfs.clear();
    vi.clearAllMocks();
    setupVfsDefaults(state);
  });

  describe('GET /api/personalization/config', () => {
    it('returns FREE tier configuration by default', async () => {
      const res = await request(buildApp()).get('/api/personalization/config');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('widgets');
      expect(res.body).toHaveProperty('features');
      expect(res.body.features.aiInsights).toBe(false);
      expect(res.body.widgets.find((w: { id: string; visible?: boolean; colSpan?: number }) => w.id === 'strategy-controls')?.visible).toBe(false);
    });

    it('returns PRO tier configuration', async () => {
      const res = await request(buildApp()).get('/api/personalization/config?tier=PRO');

      expect(res.status).toBe(200);
      expect(res.body.features.aiInsights).toBe(true);
      expect(res.body.features.customAlerts).toBe(true);
      expect(res.body.widgets.find((w: { id: string; visible?: boolean; colSpan?: number }) => w.id === 'strategy-controls')?.visible).toBe(true);
      expect(res.body.widgets.find((w: { id: string; visible?: boolean; colSpan?: number }) => w.id === 'strategy-controls')?.colSpan).toBe(4);
    });

    it('returns ENTERPRISE tier configuration', async () => {
      const res = await request(buildApp()).get('/api/personalization/config?tier=ENTERPRISE');

      expect(res.status).toBe(200);
      expect(res.body.features.aiInsights).toBe(true);
      expect(res.body.features.unlimitedStrategies).toBe(true);
      expect(res.body.widgets.find((w: { id: string; visible?: boolean }) => w.id === 'ai-insights-panel')?.visible).toBe(true);
    });

    it('returns 400 for invalid tier parameter', async () => {
      const res = await request(buildApp()).get('/api/personalization/config?tier=INVALID');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid tier parameter' });
    });
  });

  describe('GET /api/personalization/ab-config', () => {
    it('returns 400 when tenantId is missing', async () => {
      const res = await request(buildApp()).get('/api/personalization/ab-config');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Missing or invalid tenantId' });
    });

    it('returns 400 when tenantId contains invalid characters (LFI attempt)', async () => {
      const res = await request(buildApp()).get('/api/personalization/ab-config?tenantId=../../evil');

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

      const res = await request(buildApp()).get(`/api/personalization/ab-config?tenantId=${tenantId}`);

      expect(res.status).toBe(200);
      expect(res.body.tenantId).toBe(tenantId);
      expect(res.body.variant).toBe('A');
      expect(res.body.config).toEqual({ theme: 'default', promoBanner: false, abTestingEnabled: true });
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

      const res = await request(buildApp()).get(`/api/personalization/ab-config?tenantId=${tenantId}`);

      expect(res.status).toBe(200);
      expect(res.body.tenantId).toBe(tenantId);
      expect(res.body.variant).toBe('B');
      expect(res.body.config).toEqual({ theme: 'cyberpunk', promoBanner: true, abTestingEnabled: true });
    });
  });
});
