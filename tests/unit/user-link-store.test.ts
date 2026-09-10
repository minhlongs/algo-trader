import { describe, it, expect, beforeEach, afterEach, vi, Mocked } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { UserLinkStore } from '../../src/platform/telegram/user-link-store';
import { logger } from '../../src/shared/utils/logger';

vi.mock('../../src/shared/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function makeTempPath(): string {
  return path.join(os.tmpdir(), `user-link-store-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
}

describe('UserLinkStore', () => {
  let store: UserLinkStore;
  let tempPath: string;

  beforeEach(() => {
    UserLinkStore.resetInstance();
    tempPath = makeTempPath();
    store = UserLinkStore.getInstance(tempPath);
  });

  afterEach(() => {
    UserLinkStore.resetInstance();
    try { fs.unlinkSync(tempPath); } catch { /* noop */ }
  });

  it('starts empty', () => {
    expect(store.getAll()).toHaveLength(0);
    expect(store.getByTelegramUserId(1)).toBeUndefined();
  });

  it('links and retrieves by telegram user id', () => {
    store.link(123, 'lic-abc');
    const link = store.getByTelegramUserId(123);
    expect(link).toBeDefined();
    expect(link!.licenseId).toBe('lic-abc');
    expect(link!.linkedAt).toBeTruthy();
  });

  it('retrieves by license id', () => {
    store.link(456, 'lic-xyz');
    const link = store.getByLicenseId('lic-xyz');
    expect(link).toBeDefined();
    expect(link!.telegramUserId).toBe(456);
  });

  it('unlinks and removes entry', () => {
    store.link(789, 'lic-del');
    expect(store.getByTelegramUserId(789)).toBeDefined();

    const removed = store.unlink(789);
    expect(removed).toBe(true);
    expect(store.getByTelegramUserId(789)).toBeUndefined();
  });

  it('returns false when unlinking non-existent user', () => {
    const removed = store.unlink(9999);
    expect(removed).toBe(false);
  });

  it('getAllTelegramUserIds returns all linked users', () => {
    store.link(1, 'lic-a');
    store.link(2, 'lic-b');
    store.link(3, 'lic-c');

    const ids = store.getAllTelegramUserIds();
    expect(ids).toContain(1);
    expect(ids).toContain(2);
    expect(ids).toContain(3);
    expect(ids).toHaveLength(3);
  });

  it('getAll returns full link details', () => {
    store.link(11, 'lic-all-1');
    store.link(22, 'lic-all-2');

    const all = store.getAll();
    expect(all).toHaveLength(2);
    expect(all.every((l) => typeof l.telegramUserId === 'number')).toBe(true);
    expect(all.every((l) => typeof l.licenseId === 'string')).toBe(true);
    expect(all.every((l) => typeof l.linkedAt === 'string')).toBe(true);
  });

  it('overwrites existing link on re-link', () => {
    store.link(50, 'lic-old');
    store.link(50, 'lic-new');

    const link = store.getByTelegramUserId(50);
    expect(link!.licenseId).toBe('lic-new');
  });

  it('bidirectional lookup integrity', () => {
    store.link(100, 'lic-100');
    store.link(200, 'lic-200');

    const byUser = store.getByTelegramUserId(200);
    const byLicense = store.getByLicenseId('lic-100');

    expect(byUser!.licenseId).toBe('lic-200');
    expect(byLicense!.telegramUserId).toBe(100);
  });

  it('persists to file and reloads on new instance', () => {
    store.link(42, 'lic-persist');

    // Create fresh instance from same file
    UserLinkStore.resetInstance();
    const reloaded = UserLinkStore.getInstance(tempPath);

    expect(reloaded.getByTelegramUserId(42)).toBeDefined();
    expect(reloaded.getByTelegramUserId(42)!.licenseId).toBe('lic-persist');
  });

  it('load() catch branch: starts fresh when the file contains invalid JSON', () => {
    fs.writeFileSync(tempPath, '{ not valid json', 'utf-8');
    UserLinkStore.resetInstance();
    const fresh = UserLinkStore.getInstance(tempPath);
    expect(fresh.getAll()).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(
      '[UserLinkStore] Failed to load, starting fresh:',
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it('save() mkdir branch: creates the directory tree when it does not exist', () => {
    const deepDir = path.join(os.tmpdir(), `uls-deep-${Date.now()}`);
    const deepPath = path.join(deepDir, 'sub', 'links.json');
    UserLinkStore.resetInstance();
    const deepStore = UserLinkStore.getInstance(deepPath);
    deepStore.link(42, 'lic-deep');
    expect(fs.existsSync(deepDir)).toBe(true);
    expect(fs.existsSync(deepPath)).toBe(true);
    fs.rmSync(deepDir, { recursive: true, force: true });
  });

  it('save() error branch: logs an error when write fails', () => {
    // Point the store at a path whose parent is a file (not a directory) so
    // path.dirname returns a file path and mkdirSync throws ENOTDIR.
    const blocker = path.join(os.tmpdir(), `uls-blocker-${Date.now()}.file`);
    fs.writeFileSync(blocker, 'blocker', 'utf-8');
    const badPath = path.join(blocker, 'links.json');
    UserLinkStore.resetInstance();
    const badStore = UserLinkStore.getInstance(badPath);
    expect(() => badStore.link(1, 'lic-bad')).not.toThrow();
    expect(logger.error).toHaveBeenCalledWith(
      '[UserLinkStore] Failed to save:',
      expect.objectContaining({ error: expect.any(Error) }),
    );
    fs.unlinkSync(blocker);
  });
});
