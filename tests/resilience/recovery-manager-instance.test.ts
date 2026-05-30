import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RecoveryManager } from '../../src/resilience/recovery-manager.js';
import type { RecoveryState } from '../../src/resilience/recovery-manager.js';

// Suppress logger noise
vi.mock('../../src/core/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function makeState(overrides: Partial<RecoveryState> = {}): RecoveryState {
  return {
    strategies: [],
    positions: [],
    lastEquity: '1000',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('RecoveryManager — instance isolation', () => {
  let tempDir: string;
  let basePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'recovery-manager-test-'));
    basePath = join(tempDir, 'recovery-state.json');
    // Clear PM2 env var between tests
    delete process.env['PM2_INSTANCE_ID'];
  });

  afterEach(() => {
    delete process.env['PM2_INSTANCE_ID'];
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('uses PM2_INSTANCE_ID when set', () => {
    process.env['PM2_INSTANCE_ID'] = '3';
    const mgr = new RecoveryManager(basePath);
    mgr.saveState(makeState());

    const files = readdirSync(tempDir);
    expect(files).toContain('recovery-state-3.json');
  });

  it('falls back to process.pid when PM2_INSTANCE_ID is absent', () => {
    const mgr = new RecoveryManager(basePath);
    mgr.saveState(makeState());

    const files = readdirSync(tempDir);
    expect(files.some((f) => f.match(/recovery-state-\d+\.json/))).toBe(true);
    // Must NOT write bare recovery-state.json
    expect(files).not.toContain('recovery-state.json');
  });

  it('each instance writes to its own file — no clobber', () => {
    process.env['PM2_INSTANCE_ID'] = '0';
    const mgr0 = new RecoveryManager(basePath);
    mgr0.saveState(makeState({ lastEquity: '100' }));

    process.env['PM2_INSTANCE_ID'] = '1';
    const mgr1 = new RecoveryManager(basePath);
    mgr1.saveState(makeState({ lastEquity: '200' }));

    const files = readdirSync(tempDir);
    expect(files).toContain('recovery-state-0.json');
    expect(files).toContain('recovery-state-1.json');
  });

  it('loadState returns the most recent snapshot across instances', () => {
    vi.useFakeTimers();

    vi.setSystemTime(1000);
    process.env['PM2_INSTANCE_ID'] = '0';
    const mgr0 = new RecoveryManager(basePath);
    mgr0.saveState(makeState({ lastEquity: 'old' }));

    vi.setSystemTime(2000);
    process.env['PM2_INSTANCE_ID'] = '1';
    const mgr1 = new RecoveryManager(basePath);
    mgr1.saveState(makeState({ lastEquity: 'new' }));

    vi.useRealTimers();

    // Either instance should find the newest
    process.env['PM2_INSTANCE_ID'] = '0';
    const loaded = mgr0.loadState();
    expect(loaded).not.toBeNull();
    expect(loaded!.lastEquity).toBe('new');
  });

  it('clearState removes only this instance file', () => {
    process.env['PM2_INSTANCE_ID'] = '0';
    const mgr0 = new RecoveryManager(basePath);
    mgr0.saveState(makeState());

    process.env['PM2_INSTANCE_ID'] = '1';
    const mgr1 = new RecoveryManager(basePath);
    mgr1.saveState(makeState());

    mgr1.clearState();

    const files = readdirSync(tempDir);
    expect(files).toContain('recovery-state-0.json');
    expect(files).not.toContain('recovery-state-1.json');
  });

  it('clearAllStates removes all instance files', () => {
    process.env['PM2_INSTANCE_ID'] = '0';
    const mgr0 = new RecoveryManager(basePath);
    mgr0.saveState(makeState());

    process.env['PM2_INSTANCE_ID'] = '1';
    const mgr1 = new RecoveryManager(basePath);
    mgr1.saveState(makeState());

    mgr0.clearAllStates();

    const files = readdirSync(tempDir);
    expect(files.filter((f) => f.endsWith('.json'))).toHaveLength(0);
  });

  it('loadState returns null when no files exist', () => {
    process.env['PM2_INSTANCE_ID'] = '0';
    const mgr = new RecoveryManager(basePath);
    expect(mgr.loadState()).toBeNull();
  });

  it('shouldRecover returns false for stale snapshot', () => {
    process.env['PM2_INSTANCE_ID'] = '0';
    const mgr = new RecoveryManager(basePath);
    // Save state now, then advance time by 2 hours so the snapshot becomes stale
    mgr.saveState(makeState());
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000);
    const result = mgr.shouldRecover();
    vi.useRealTimers();
    expect(result).toBe(false);
  });

  it('shouldRecover returns true for fresh snapshot', () => {
    process.env['PM2_INSTANCE_ID'] = '0';
    const mgr = new RecoveryManager(basePath);
    mgr.saveState(makeState());
    expect(mgr.shouldRecover()).toBe(true);
  });

  it('saveState uses atomic write (no .tmp file left on disk)', () => {
    process.env['PM2_INSTANCE_ID'] = '0';
    const mgr = new RecoveryManager(basePath);
    mgr.saveState(makeState());

    const files = readdirSync(tempDir);
    expect(files.some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('loadState skips corrupted files and returns best valid snapshot', () => {
    process.env['PM2_INSTANCE_ID'] = '0';
    const mgr0 = new RecoveryManager(basePath);
    mgr0.saveState(makeState({ lastEquity: 'valid' }));

    // Write a corrupted sibling
    writeFileSync(join(tempDir, 'recovery-state-9.json'), '{ bad json %%', 'utf8');

    process.env['PM2_INSTANCE_ID'] = '0';
    const loaded = mgr0.loadState();
    expect(loaded).not.toBeNull();
    expect(loaded!.lastEquity).toBe('valid');
  });

  it('preserves existing API: startAutoSave / stopAutoSave / isAutoSaveRunning', () => {
    vi.useFakeTimers();
    process.env['PM2_INSTANCE_ID'] = '0';
    const mgr = new RecoveryManager(basePath);
    expect(mgr.isAutoSaveRunning()).toBe(false);

    mgr.startAutoSave(1000, () => makeState());
    expect(mgr.isAutoSaveRunning()).toBe(true);

    vi.advanceTimersByTime(1100);
    const files = readdirSync(tempDir);
    expect(files).toContain('recovery-state-0.json');

    mgr.stopAutoSave();
    expect(mgr.isAutoSaveRunning()).toBe(false);
    vi.useRealTimers();
  });
});
