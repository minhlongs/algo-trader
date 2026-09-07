/**
 * CLI entry point tests for auto-marketing-daemon.
 *
 * The daemon's CLI entry point was refactored into an exported runCli(argv)
 * function so it can be invoked deterministically from tests without relying
 * on module-eval-time side effects. This file exercises runCli directly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockReadJson, mockWriteJson, mockGenerateLlmBlogPost, mockDistributePost, mockLogger } = vi.hoisted(() => ({
  mockReadJson: vi.fn(),
  mockWriteJson: vi.fn(),
  mockGenerateLlmBlogPost: vi.fn(),
  mockDistributePost: vi.fn().mockResolvedValue(undefined),
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));
vi.mock('../../../shared/persistence/persistent-store', () => ({
  readJson: mockReadJson,
  writeJson: mockWriteJson,
}));
vi.mock('../llm-content-generator', () => ({
  generateLlmBlogPost: mockGenerateLlmBlogPost,
}));
vi.mock('../social-auto-poster', () => ({
  distributePost: mockDistributePost,
}));
vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path');
  return { ...actual, join: (...args: string[]) => args.join('/') };
});

import { runCli } from '../auto-marketing-daemon';

describe('CLI entry point', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadJson.mockReturnValue(undefined);
    mockGenerateLlmBlogPost.mockImplementation((_type: string, fallback: () => unknown) => Promise.resolve(fallback()));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs daemon and exits 0 on success when invoked as CLI', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));

    try {
      runCli(['/path/to/node', '/path/to/auto-marketing-daemon.ts']);
      await vi.runAllTimersAsync();
      expect(exitSpy).toHaveBeenCalledWith(0);
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('calls logger.error and exits 1 when runAutoMarketing throws', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
    mockReadJson.mockImplementation(() => { throw new Error('storage fail'); });

    try {
      runCli(['/path/to/node', '/path/to/auto-marketing-daemon.js']);
      await vi.runAllTimersAsync();
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(mockLogger.error).toHaveBeenCalled();
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('does nothing when invoked without the daemon script name', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    runCli(['/path/to/node', '/path/to/some-other-script.ts']);
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});