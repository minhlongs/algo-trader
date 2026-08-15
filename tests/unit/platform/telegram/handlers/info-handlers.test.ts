import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Context } from 'grammy';

// Mock dependencies
vi.mock('../../../../../src/redis', () => ({
  getRedisClient: vi.fn(),
}));

vi.mock('../../../../../src/platform/telegram/user-session-repository-d1', () => ({
  userSessionRepo: {
    getByUserId: vi.fn(),
    upsert: vi.fn(),
  },
}));

import { handleStart, handleHelp, handleStatus, handleLimits } from '../../../../../src/platform/telegram/handlers/info-handlers';
import { getRedisClient } from '../../../../../src/redis';
import { userSessionRepo } from '../../../../../src/platform/telegram/user-session-repository-d1';

function createMockContext(overrides?: Partial<{ from: { id: number }; message: { text: string } }>): Context {
  return {
    from: overrides?.from ?? { id: 12345 },
    message: overrides?.message,
    reply: vi.fn(),
  } as unknown as Context;
}

describe('info-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleStart', () => {
    it('should send welcome message with available commands', async () => {
      const ctx = createMockContext();
      await handleStart(ctx);
      expect(ctx.reply).toHaveBeenCalledOnce();
      const msg = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(msg).toContain('Welcome to Algo Trader Bot');
      expect(msg).toContain('/ask');
      expect(msg).toContain('/help');
      expect(msg).toContain('/status');
    });

    it('should use Markdown parse mode', async () => {
      const ctx = createMockContext();
      await handleStart(ctx);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.any(String),
        { parse_mode: 'Markdown' },
      );
    });
  });

  describe('handleHelp', () => {
    it('should send help message with all command groups', async () => {
      const ctx = createMockContext();
      await handleHelp(ctx);
      const msg = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(msg).toContain('Commands');
      expect(msg).toContain('/ask');
      expect(msg).toContain('/link');
    });

    it('should use Markdown parse mode', async () => {
      const ctx = createMockContext();
      await handleHelp(ctx);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.any(String),
        { parse_mode: 'Markdown' },
      );
    });
  });

  describe('handleStatus', () => {
    it('should show linked keys when session has keys', async () => {
      const ctx = createMockContext();
      (userSessionRepo.getByUserId as ReturnType<typeof vi.fn>).mockResolvedValue({
        licenseKeys: ['key-abc', 'key-def'],
        notificationsEnabled: true,
      });

      await handleStatus(ctx);

      const msg = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(msg).toContain('key-abc');
      expect(msg).toContain('key-def');
      expect(msg).toContain('Your Linked Keys');
    });

    it('should show no keys message when session has no keys', async () => {
      const ctx = createMockContext();
      (userSessionRepo.getByUserId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await handleStatus(ctx);

      const msg = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(msg).toContain('No license keys linked');
    });

    it('should show no keys message when keys array is empty', async () => {
      const ctx = createMockContext();
      (userSessionRepo.getByUserId as ReturnType<typeof vi.fn>).mockResolvedValue({
        licenseKeys: [],
        notificationsEnabled: true,
      });

      await handleStatus(ctx);

      const msg = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(msg).toContain('No license keys linked');
    });

    it('should handle missing user ID gracefully', async () => {
      const ctx = createMockContext({ from: undefined });
      (userSessionRepo.getByUserId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await handleStatus(ctx);
      // Handler may still reply with "no keys" message — just ensure no error thrown
      expect(ctx.reply).toHaveBeenCalled();
    });
  });

  describe('handleLimits', () => {
    it('should show alert thresholds for all tiers', async () => {
      const ctx = createMockContext();
      await handleLimits(ctx);
      const msg = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(msg).toContain('FREE');
      expect(msg).toContain('PRO');
      expect(msg).toContain('ENTERPRISE');
      expect(msg).toContain('80%');
      expect(msg).toContain('90%');
      expect(msg).toContain('100%');
    });

    it('should use Markdown parse mode', async () => {
      const ctx = createMockContext();
      await handleLimits(ctx);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.any(String),
        { parse_mode: 'Markdown' },
      );
    });
  });
});
