/**
 * Tests for TelegramBotService — mocks grammy Bot, Redis client, D1 session
 * repo, and all command handlers so every command registration and alert path
 * is exercised without a live Telegram connection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockLogger, mockBotCtor, mockCommand, mockOn, mockUse, mockStart, mockStop,
  mockApi, mockBotCatch, mockEnsureTable, mockGetByUserId, mockGetAll,
  mockLinkKey, mockUnlinkKey, mockRedisGet, mockRedisSetex, mockFormat,
  mockHandlers, mockSupportHandlers, mockAskHandler, mockLeaderboard,
} = vi.hoisted(() => {
  const mockHandlers = {
    handleStart: vi.fn(),
    handleHelp: vi.fn(),
    handleStatus: vi.fn(),
    handleLink: vi.fn(),
    handleUnlink: vi.fn(),
    handleNotifications: vi.fn(),
    handleLimits: vi.fn(),
    handleBalance: vi.fn(),
    handlePositions: vi.fn(),
    handlePnl: vi.fn(),
    handleCampaign: vi.fn(),
    handleResults: vi.fn(),
  };
  const mockSupportHandlers = {
    handleFaq: vi.fn(),
    handleFaqDetail: vi.fn(),
    handleSupport: vi.fn(),
    handlePricing: vi.fn(),
    handleUnknownMessage: vi.fn(),
  };
  return {
    mockHandlers,
    mockSupportHandlers,
    mockAskHandler: vi.fn(),
    mockLeaderboard: vi.fn(),
    mockLogger: { debug: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn() },
    mockBotCtor: vi.fn(),
    mockCommand: vi.fn(),
    mockOn: vi.fn(),
    mockUse: vi.fn(),
    mockStart: vi.fn(),
    mockStop: vi.fn(),
    mockApi: { sendMessage: vi.fn() },
    mockBotCatch: vi.fn(),
    mockEnsureTable: vi.fn(),
    mockGetByUserId: vi.fn(),
    mockGetAll: vi.fn(),
    mockLinkKey: vi.fn(),
    mockUnlinkKey: vi.fn(),
    mockRedisGet: vi.fn(),
    mockRedisSetex: vi.fn(),
    mockFormat: vi.fn(() => 'formatted'),
  };
});

vi.mock('grammy', () => ({
  Bot: class Stub {
    command = mockCommand;
    on = mockOn;
    use = mockUse;
    start = mockStart;
    stop = mockStop;
    api = mockApi;
    catch = mockBotCatch;
    constructor(token: unknown) { mockBotCtor(token); }
  },
  Context: class {},
}));

vi.mock('../../../../src/redis', () => ({
  getRedisClient: () => ({ get: mockRedisGet, setex: mockRedisSetex }),
}));

vi.mock('../../../../src/shared/utils/logger', () => ({
  logger: mockLogger,
}));

vi.mock('../../../../src/platform/notifications/alert-formatter', () => ({
  formatTelegramMessage: mockFormat,
}));

vi.mock('../../../../src/platform/telegram/bot-command-handlers', () => ({
  handleStart: mockHandlers.handleStart,
  handleHelp: mockHandlers.handleHelp,
  handleStatus: mockHandlers.handleStatus,
  handleLink: mockHandlers.handleLink,
  handleUnlink: mockHandlers.handleUnlink,
  handleNotifications: mockHandlers.handleNotifications,
  handleLimits: mockHandlers.handleLimits,
  handleBalance: mockHandlers.handleBalance,
  handlePositions: mockHandlers.handlePositions,
  handlePnl: mockHandlers.handlePnl,
  handleCampaign: mockHandlers.handleCampaign,
  handleResults: mockHandlers.handleResults,
}));

vi.mock('../../../../src/platform/telegram/auto-support-handlers', () => ({
  handleFaq: mockSupportHandlers.handleFaq,
  handleFaqDetail: mockSupportHandlers.handleFaqDetail,
  handleSupport: mockSupportHandlers.handleSupport,
  handlePricing: mockSupportHandlers.handlePricing,
  handleUnknownMessage: mockSupportHandlers.handleUnknownMessage,
}));

vi.mock('../../../../src/platform/telegram/ask-handler', () => ({
  handleAsk: mockAskHandler,
}));

vi.mock('../../../../src/platform/telegram/leaderboard-handler', () => ({
  handleLeaderboard: mockLeaderboard,
}));

vi.mock('../../../../src/platform/telegram/user-session-repository-d1', () => ({
  userSessionRepo: {
    ensureTable: mockEnsureTable,
    getByUserId: mockGetByUserId,
    getAll: mockGetAll,
    linkLicenseKey: mockLinkKey,
    unlinkLicenseKey: mockUnlinkKey,
  },
}));

type Service = typeof import('../../../../src/platform/telegram/bot').TelegramBotService;
type Mod = typeof import('../../../../src/platform/telegram/bot');

let mod: Mod;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  mod = await import('../../../../src/platform/telegram/bot');
  // Reset the singleton created at module import time so each test starts clean.
  (mod.TelegramBotService as unknown as { instance: unknown }).instance = null;
});

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('TelegramBotService', () => {
  describe('getInstance', () => {
    it('returns a singleton instance', () => {
      const a = mod.TelegramBotService.getInstance();
      const b = mod.TelegramBotService.getInstance();
      expect(a).toBe(b);
    });

    it('uses provided config token', () => {
      const svc = mod.TelegramBotService.getInstance({ botToken: 'custom' });
      expect(svc).toBeDefined();
    });
  });

  describe('initialize', () => {
    it('returns false when no token is set', () => {
      delete process.env.TELEGRAM_BOT_TOKEN;
      const svc = mod.TelegramBotService.getInstance();
      expect(svc.initialize()).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('[TelegramBot] Missing TELEGRAM_BOT_TOKEN');
    });

    it('returns true and constructs a Bot when token is set', () => {
      const svc = mod.TelegramBotService.getInstance();
      expect(svc.initialize()).toBe(true);
      expect(mockBotCtor).toHaveBeenCalledWith('test-token');
      expect(mockLogger.info).toHaveBeenCalledWith('[TelegramBot] Initialized with Telegram');
    });

    it('returns true on second call (Bot is constructed each initialize; no re-init guard)', () => {
      const svc = mod.TelegramBotService.getInstance();
      svc.initialize();
      const callsAfterFirst = mockBotCtor.mock.calls.length;
      svc.initialize();
      expect(mockBotCtor.mock.calls.length).toBe(callsAfterFirst + 1);
    });

    it('isInitialized reflects initialize result', () => {
      const svc = mod.TelegramBotService.getInstance();
      expect(svc.isInitialized()).toBe(false);
      svc.initialize();
      expect(svc.isInitialized()).toBe(true);
    });

    it('returns false and logs when Bot construction throws', () => {
      // Make the grammy Bot constructor throw on this call.
      mockBotCtor.mockImplementationOnce(() => { throw new Error('ctor boom'); });
      const svc = mod.TelegramBotService.getInstance();
      expect(svc.initialize()).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('[TelegramBot] Initialization failed:', { error: expect.any(Error) });
    });
  });

  describe('setupCommands', () => {
    it('registers all expected command handlers', () => {
      const svc = mod.TelegramBotService.getInstance();
      svc.initialize();
      const registered = mockCommand.mock.calls.map((c) => c[0]);
      for (const cmd of ['start', 'help', 'status', 'link', 'unlink', 'notifications', 'limits', 'balance', 'positions', 'pnl', 'campaign', 'results', 'faq', 'support', 'pricing', 'leaderboard', 'ask']) {
        expect(registered).toContain(cmd);
      }
    });

    it('registers a message:text catch-all', () => {
      const svc = mod.TelegramBotService.getInstance();
      svc.initialize();
      expect(mockOn).toHaveBeenCalledWith('message:text', expect.any(Function));
    });

    it('faq bare command routes to handleFaq, with args routes to handleFaqDetail', () => {
      const svc = mod.TelegramBotService.getInstance();
      svc.initialize();
      const faqCall = mockCommand.mock.calls.find((c) => c[0] === 'faq');
      expect(faqCall).toBeDefined();
      const bareCtx = { message: { text: '/faq' } };
      faqCall![1](bareCtx);
      expect(mockSupportHandlers.handleFaq).toHaveBeenCalledWith(bareCtx);
      const detailCtx = { message: { text: '/faq something' } };
      faqCall![1](detailCtx);
      expect(mockSupportHandlers.handleFaqDetail).toHaveBeenCalledWith(detailCtx);
    });

    it('ask with empty query replies with help text and does not call handleAsk', async () => {
      const svc = mod.TelegramBotService.getInstance();
      svc.initialize();
      const askCall = mockCommand.mock.calls.find((c) => c[0] === 'ask');
      const reply = vi.fn();
      await askCall![1]({ message: { text: '/ask' }, reply });
      expect(reply).toHaveBeenCalled();
      expect(mockAskHandler).not.toHaveBeenCalled();
    });

    it('ask with a query calls handleAsk with the extracted query', async () => {
      const svc = mod.TelegramBotService.getInstance();
      svc.initialize();
      const askCall = mockCommand.mock.calls.find((c) => c[0] === 'ask');
      const reply = vi.fn();
      await askCall![1]({ message: { text: '/ask what is my risk?' }, reply });
      expect(mockAskHandler).toHaveBeenCalledWith({ message: { text: '/ask what is my risk?' }, reply }, 'what is my risk?');
    });
  });

  describe('setupMiddleware', () => {
    it('registers middleware via bot.use', () => {
      const svc = mod.TelegramBotService.getInstance();
      svc.initialize();
      expect(mockUse).toHaveBeenCalled();
    });
  });

  describe('start', () => {
    it('throws if not initialized', async () => {
      const svc = mod.TelegramBotService.getInstance();
      await expect(svc.start()).rejects.toThrow('TelegramBot not initialized');
    });

    it('ensures D1 table and starts the bot', async () => {
      const svc = mod.TelegramBotService.getInstance();
      svc.initialize();
      await svc.start();
      expect(mockEnsureTable).toHaveBeenCalled();
      expect(mockStart).toHaveBeenCalled();
    });

    it('logs running as @username via onStart', async () => {
      const svc = mod.TelegramBotService.getInstance();
      svc.initialize();
      await svc.start();
      const onStart = mockStart.mock.calls[0][0].onStart;
      onStart({ username: 'test_bot' });
      expect(mockLogger.info).toHaveBeenCalledWith('[TelegramBot] Running as @test_bot');
    });

    it('registers a bot.catch error handler', async () => {
      const svc = mod.TelegramBotService.getInstance();
      svc.initialize();
      await svc.start();
      expect(mockBotCatch).toHaveBeenCalled();
    });

    it('the registered bot.catch handler logs errors', async () => {
      const svc = mod.TelegramBotService.getInstance();
      svc.initialize();
      await svc.start();
      const handler = mockBotCatch.mock.calls[0]![0] as (err: unknown) => void;
      handler({ code: 'ECONN' });
      expect(mockLogger.error).toHaveBeenCalledWith('[TelegramBot] Error:', { error: { code: 'ECONN' } });
    });
  });

  describe('stop', () => {
    it('stops the bot and marks uninitialized', async () => {
      const svc = mod.TelegramBotService.getInstance();
      svc.initialize();
      await svc.stop();
      expect(mockStop).toHaveBeenCalled();
      expect(svc.isInitialized()).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('[TelegramBot] Stopped');
    });

    it('no-ops when bot is null', async () => {
      const svc = mod.TelegramBotService.getInstance();
      await svc.stop();
      expect(mockStop).not.toHaveBeenCalled();
    });
  });

  describe('sendThresholdAlert', () => {
    it('returns false when not initialized', async () => {
      const svc = mod.TelegramBotService.getInstance();
      const result = await svc.sendThresholdAlert(1, 'lk', 80, 80, 100, 80);
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('[TelegramBot] Not initialized, skipping message');
    });

    it('returns false when notifications disabled for user', async () => {
      const svc = mod.TelegramBotService.getInstance();
      svc.initialize();
      mockGetByUserId.mockResolvedValueOnce({ userId: 1, licenseKeys: ['lk'], notificationsEnabled: false, lastCommand: '' });
      const result = await svc.sendThresholdAlert(1, 'lk', 80, 80, 100, 80);
      expect(result).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('[TelegramBot] Notifications disabled for user 1');
    });

    it('sends a message when notifications enabled', async () => {
      const svc = mod.TelegramBotService.getInstance();
      svc.initialize();
      mockGetByUserId.mockResolvedValueOnce({ userId: 1, licenseKeys: ['lk'], notificationsEnabled: true, lastCommand: '' });
      mockRedisGet.mockResolvedValueOnce(null);
      const result = await svc.sendThresholdAlert(1, 'lk', 80, 80, 100, 80);
      expect(result).toBe(true);
      expect(mockFormat).toHaveBeenCalledWith({ licenseKey: 'lk', threshold: 80, currentUsage: 80, dailyLimit: 100, percentUsed: 80 });
      expect(mockApi.sendMessage).toHaveBeenCalledWith(1, 'formatted', { parse_mode: 'Markdown' });
      expect(mockLogger.info).toHaveBeenCalledWith('[TelegramBot] Alert sent to chat 1');
    });

    it('waits for the rate-limit delay when the last send was recent', async () => {
      const svc = mod.TelegramBotService.getInstance();
      svc.initialize();
      mockGetByUserId.mockResolvedValueOnce({ userId: 1, licenseKeys: ['lk'], notificationsEnabled: true, lastCommand: '' });
      // last send 100ms ago → elapsed < rateLimitDelay (1000ms) → must wait ~900ms
      mockRedisGet.mockResolvedValueOnce(String(Date.now() - 100));
      const result = await svc.sendThresholdAlert(1, 'lk', 80, 80, 100, 80);
      expect(result).toBe(true);
      expect(mockApi.sendMessage).toHaveBeenCalled();
    });

    it('returns false when sendMessage throws', async () => {
      const svc = mod.TelegramBotService.getInstance();
      svc.initialize();
      mockGetByUserId.mockResolvedValueOnce({ userId: 1, licenseKeys: ['lk'], notificationsEnabled: true, lastCommand: '' });
      mockRedisGet.mockResolvedValueOnce(null);
      mockApi.sendMessage.mockRejectedValueOnce(new Error('boom'));
      const result = await svc.sendThresholdAlert(1, 'lk', 80, 80, 100, 80);
      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('[TelegramBot] Send failed:', { error: expect.any(Error) });
    });
  });

  describe('sendToAllLinkedUsers', () => {
    it('sends only to linked users with notifications enabled', async () => {
      const svc = mod.TelegramBotService.getInstance();
      svc.initialize();
      mockGetAll.mockResolvedValueOnce([
        { userId: 1, licenseKeys: ['lk'], notificationsEnabled: true, lastCommand: '' },
        { userId: 2, licenseKeys: ['lk'], notificationsEnabled: false, lastCommand: '' },
        { userId: 3, licenseKeys: ['other'], notificationsEnabled: true, lastCommand: '' },
      ]);
      mockGetByUserId.mockResolvedValue({ userId: 1, licenseKeys: ['lk'], notificationsEnabled: true, lastCommand: '' });
      mockRedisGet.mockResolvedValue(null);
      const count = await svc.sendToAllLinkedUsers('lk', 80, 80, 100, 80);
      expect(count).toBe(1);
    });

    it('returns 0 when no sessions exist', async () => {
      const svc = mod.TelegramBotService.getInstance();
      svc.initialize();
      mockGetAll.mockResolvedValueOnce([]);
      const count = await svc.sendToAllLinkedUsers('lk', 80, 80, 100, 80);
      expect(count).toBe(0);
    });
  });

  describe('applyRateLimitRedis', () => {
    it('sets the rate-limit key after sending', async () => {
      const svc = mod.TelegramBotService.getInstance();
      svc.initialize();
      mockGetByUserId.mockResolvedValueOnce({ userId: 1, licenseKeys: ['lk'], notificationsEnabled: true, lastCommand: '' });
      mockRedisGet.mockResolvedValueOnce(null);
      await svc.sendThresholdAlert(1, 'lk', 80, 80, 100, 80);
      expect(mockRedisSetex).toHaveBeenCalled();
    });

    it('does not crash when redis throws (redis errors caught, alert still sends)', async () => {
      const svc = mod.TelegramBotService.getInstance();
      svc.initialize();
      mockGetByUserId.mockResolvedValueOnce({ userId: 1, licenseKeys: ['lk'], notificationsEnabled: true, lastCommand: '' });
      mockRedisGet.mockRejectedValueOnce(new Error('redis down'));
      const result = await svc.sendThresholdAlert(1, 'lk', 80, 80, 100, 80);
      expect(result).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith('[TelegramBot] Redis rate limiting failed:', { error: expect.any(Error) });
    });
  });

  describe('user session helpers', () => {
    it('getUserSession delegates to repo', async () => {
      const svc = mod.TelegramBotService.getInstance();
      mockGetByUserId.mockResolvedValueOnce({ userId: 1, licenseKeys: [], notificationsEnabled: true, lastCommand: '' });
      const session = await svc.getUserSession(1);
      expect(mockGetByUserId).toHaveBeenCalledWith(1);
      expect(session).toBeDefined();
    });

    it('linkLicenseKey delegates to repo', async () => {
      const svc = mod.TelegramBotService.getInstance();
      await svc.linkLicenseKey(1, 'lk');
      expect(mockLinkKey).toHaveBeenCalledWith(1, 'lk');
    });

    it('unlinkLicenseKey delegates to repo', async () => {
      const svc = mod.TelegramBotService.getInstance();
      await svc.unlinkLicenseKey(1, 'lk');
      expect(mockUnlinkKey).toHaveBeenCalledWith(1, 'lk');
    });
  });

  describe('singleton export', () => {
    it('exports a singleton instance', () => {
      expect(mod.telegramBotService).toBeDefined();
    });
  });
});
