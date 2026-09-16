/**
 * Personalization Events Tests — Event Logging & Isolation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { join } from 'node:path';
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

describe('POST /api/personalization/events — Event Logging & Isolation', () => {
  beforeEach(() => {
    vfs.clear();
    vi.clearAllMocks();
    setupVfsDefaults(state);
  });

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

    const res1 = await request(buildApp())
      .post('/api/personalization/events')
      .send({ tenantId, eventType: 'dashboard_load', eventData: { screen: 'main' } });

    expect(res1.status).toBe(201);
    expect(res1.body.success).toBe(true);
    expect(res1.body.event.eventType).toBe('dashboard_load');
    expect(res1.body.event.eventData).toEqual({ screen: 'main' });
    expect(res1.body.event).toHaveProperty('timestamp');

    const eventFile = join(dataDirPath(), `events_${tenantId}.json`);
    expect(vfs.has(eventFile)).toBe(true);
    let content = JSON.parse(vfs.get(eventFile)!);
    expect(content).toHaveLength(1);
    expect(content[0].eventType).toBe('dashboard_load');
    expect(content[0].eventData).toEqual({ screen: 'main' });

    const res2 = await request(buildApp())
      .post('/api/personalization/events')
      .send({ tenantId, eventType: 'widget_click', eventData: { widget: 'candlestick' } });

    expect(res2.status).toBe(201);

    content = JSON.parse(vfs.get(eventFile)!);
    expect(content).toHaveLength(2);
    expect(content[0].eventType).toBe('dashboard_load');
    expect(content[1].eventType).toBe('widget_click');
    expect(content[1].eventData).toEqual({ widget: 'candlestick' });

    const otherTenant = 'test-tenant-2';
    const otherFile = join(dataDirPath(), `events_${otherTenant}.json`);

    const res3 = await request(buildApp())
      .post('/api/personalization/events')
      .send({ tenantId: otherTenant, eventType: 'upgrade_banner_click' });

    expect(res3.status).toBe(201);
    expect(vfs.has(otherFile)).toBe(true);
    const otherContent = JSON.parse(vfs.get(otherFile)!);
    expect(otherContent).toHaveLength(1);
    expect(otherContent[0].eventType).toBe('upgrade_banner_click');

    content = JSON.parse(vfs.get(eventFile)!);
    expect(content).toHaveLength(2);
  });

  it('blocks directory traversal in tenantId', async () => {
    const res = await request(buildApp())
      .post('/api/personalization/events')
      .send({ tenantId: '../../evil', eventType: 'test_event' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Missing or invalid tenantId' });

    const evilPath = join(dataDirPath(), '..', 'events_.._evil.json');
    expect(vfs.has(evilPath)).toBe(false);
  });
});
