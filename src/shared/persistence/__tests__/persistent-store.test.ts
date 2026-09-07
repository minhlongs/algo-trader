/**
 * PersistentStore — Unit Tests
 *
 * Tests JSON-file-backed Map storage:
 * - constructor
 * - save: creates dirs, writes 0o600
 * - load: returns empty Map on miss, parses entries, catch returns empty Map
 * - readJson: returns parsed T, null on miss, null on parse error
 * - writeJson: writes JSON, creates dirs
 * - atomicWriteJson: writes tmp then renames
 * - Named exports: readJson, writeJson, atomicWriteJson
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ── Mocks ────────────────────────────────────────────────────────────────────

const {
  mockExistsSync,
  mockMkdirSync,
  mockWriteFileSync,
  mockReadFileSync,
  mockRenameSync,
} = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockRenameSync: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync,
  renameSync: mockRenameSync,
}));

vi.mock('path', () => ({
  dirname: vi.fn((p: string) => {
    const i = p.lastIndexOf('/');
    return i >= 0 ? p.slice(0, i) : '.';
  }),
}));

import { PersistentStore, readJson, writeJson, atomicWriteJson } from '../persistent-store';

// ── Constants ────────────────────────────────────────────────────────────────

const TEST_PATH = '/data/store.json';
const TEST_TMP_PATH = '/data/store.json.tmp';

// ── Helpers ──────────────────────────────────────────────────────────────────

function resetAllMocks(): void {
  mockExistsSync.mockReset();
  mockMkdirSync.mockReset();
  mockWriteFileSync.mockReset();
  mockReadFileSync.mockReset();
  mockRenameSync.mockReset();
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PersistentStore', () => {
  beforeEach(resetAllMocks);

  afterEach(() => vi.restoreAllMocks());

  // ── Constructor ────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('stores the path', () => {
      const store = new PersistentStore(TEST_PATH);
      expect(store).toBeDefined();
    });
  });

  // ── save ───────────────────────────────────────────────────────────────────

  describe('save', () => {
    it('creates parent directory when missing', () => {
      mockExistsSync.mockReturnValue(false);
      const store = new PersistentStore(TEST_PATH);
      store.save(new Map());
      expect(mockMkdirSync).toHaveBeenCalledWith('/data', { recursive: true });
    });

    it('does not create directory when it exists', () => {
      mockExistsSync.mockReturnValue(true);
      const store = new PersistentStore(TEST_PATH);
      store.save(new Map());
      expect(mockMkdirSync).not.toHaveBeenCalled();
    });

    it('writes empty Map as empty JSON array', () => {
      mockExistsSync.mockReturnValue(true);
      const store = new PersistentStore(TEST_PATH);
      store.save(new Map());
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        TEST_PATH,
        '[]',
        { encoding: 'utf-8', mode: 0o600 },
      );
    });

    it('writes Map entries as JSON array', () => {
      mockExistsSync.mockReturnValue(true);
      const store = new PersistentStore(TEST_PATH);
      const data = new Map([['a', { x: 1 }], ['b', { x: 2 }]]);
      store.save(data);
      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1]);
      expect(written).toEqual([['a', { x: 1 }], ['b', { x: 2 }]]);
      expect(mockWriteFileSync.mock.calls[0][2]).toEqual({ encoding: 'utf-8', mode: 0o600 });
    });

    it('uses pretty-printed JSON', () => {
      mockExistsSync.mockReturnValue(true);
      const store = new PersistentStore(TEST_PATH);
      store.save(new Map([['k', 'v']]));
      expect(mockWriteFileSync.mock.calls[0][1]).toContain('\n');
    });
  });

  // ── load ───────────────────────────────────────────────────────────────────

  describe('load', () => {
    it('returns empty Map when file does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      const store = new PersistentStore(TEST_PATH);
      const result = store.load();
      expect(result.size).toBe(0);
      expect(mockReadFileSync).not.toHaveBeenCalled();
    });

    it('returns empty Map on JSON parse error', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('invalid json');
      const store = new PersistentStore(TEST_PATH);
      const result = store.load();
      expect(result.size).toBe(0);
    });

    it('returns empty Map on read error (catch block)', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => { throw new Error('EACCES'); });
      const store = new PersistentStore(TEST_PATH);
      const result = store.load();
      expect(result.size).toBe(0);
    });

    it('loads entries from valid JSON file', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify([['a', 1], ['b', 2]]));
      const store = new PersistentStore<number>(TEST_PATH);
      const result = store.load();
      expect(result.size).toBe(2);
      expect(result.get('a')).toBe(1);
      expect(result.get('b')).toBe(2);
    });

    it('loads empty array as empty Map', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('[]');
      const store = new PersistentStore(TEST_PATH);
      const result = store.load();
      expect(result.size).toBe(0);
    });
  });

  // ── readJson (static) ──────────────────────────────────────────────────────

  describe('readJson', () => {
    it('returns null when file does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      expect(PersistentStore.readJson(TEST_PATH)).toBeNull();
      expect(mockReadFileSync).not.toHaveBeenCalled();
    });

    it('returns parsed object on success', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{"key":"value"}');
      expect(PersistentStore.readJson(TEST_PATH)).toEqual({ key: 'value' });
    });

    it('returns null on JSON parse error', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{invalid}');
      expect(PersistentStore.readJson(TEST_PATH)).toBeNull();
    });

    it('returns null on read error', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
      expect(PersistentStore.readJson(TEST_PATH)).toBeNull();
    });
  });

  // ── writeJson (static) ─────────────────────────────────────────────────────

  describe('writeJson', () => {
    it('creates parent directory when missing', () => {
      mockExistsSync.mockReturnValue(false);
      PersistentStore.writeJson(TEST_PATH, { data: 1 });
      expect(mockMkdirSync).toHaveBeenCalledWith('/data', { recursive: true });
    });

    it('does not create directory when it exists', () => {
      mockExistsSync.mockReturnValue(true);
      PersistentStore.writeJson(TEST_PATH, { data: 1 });
      expect(mockMkdirSync).not.toHaveBeenCalled();
    });

    it('writes pretty-printed JSON with 0o600', () => {
      mockExistsSync.mockReturnValue(true);
      PersistentStore.writeJson(TEST_PATH, { data: 1 });
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        TEST_PATH,
        JSON.stringify({ data: 1 }, null, 2),
        { encoding: 'utf-8', mode: 0o600 },
      );
    });
  });

  // ── atomicWriteJson (static) ───────────────────────────────────────────────

  describe('atomicWriteJson', () => {
    it('creates parent directory when missing', () => {
      mockExistsSync.mockReturnValue(false);
      PersistentStore.atomicWriteJson(TEST_PATH, { data: 1 });
      expect(mockMkdirSync).toHaveBeenCalledWith('/data', { recursive: true });
    });

    it('does not create directory when it exists', () => {
      mockExistsSync.mockReturnValue(true);
      PersistentStore.atomicWriteJson(TEST_PATH, { data: 1 });
      expect(mockMkdirSync).not.toHaveBeenCalled();
    });

    it('writes to tmp file then renames', () => {
      mockExistsSync.mockReturnValue(true);
      PersistentStore.atomicWriteJson(TEST_PATH, { data: 1 });
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        TEST_TMP_PATH,
        JSON.stringify({ data: 1 }, null, 2),
        'utf-8',
      );
      expect(mockRenameSync).toHaveBeenCalledWith(TEST_TMP_PATH, TEST_PATH);
    });

    it('rename happens after write', () => {
      mockExistsSync.mockReturnValue(true);
      PersistentStore.atomicWriteJson(TEST_PATH, { v: 1 });
      const writeIdx = mockWriteFileSync.mock.invocationCallOrder[0];
      const renameIdx = mockRenameSync.mock.invocationCallOrder[0];
      expect(writeIdx).toBeLessThan(renameIdx);
    });
  });

  // ── Named exports ──────────────────────────────────────────────────────────

  describe('named exports', () => {
    it('readJson delegates to PersistentStore.readJson', () => {
      mockExistsSync.mockReturnValue(false);
      expect(readJson(TEST_PATH)).toBeNull();
    });

    it('writeJson delegates to PersistentStore.writeJson', () => {
      mockExistsSync.mockReturnValue(true);
      writeJson(TEST_PATH, { v: 1 });
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('atomicWriteJson delegates to PersistentStore.atomicWriteJson', () => {
      mockExistsSync.mockReturnValue(true);
      atomicWriteJson(TEST_PATH, { v: 1 });
      expect(mockRenameSync).toHaveBeenCalled();
    });
  });
});
