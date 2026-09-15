import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handlePgQuery, type MockTelegramUserRow } from './notification-services-fixtures';

const { store } = vi.hoisted(() => ({
  store: new Map<number, MockTelegramUserRow>(),
}));

vi.mock('pg', () => ({
  default: {
    Pool: class {
      async query(sql: string, vals?: unknown[]) {
        return handlePgQuery(store, sql, vals);
      }
      async connect() { return this; }
      async end() {}
      on(_event: string, _handler: (...args: unknown[]) => void) { return this; }
    },
  },
}));

vi.mock('grammy', () => ({
  Bot: vi.fn(() => ({
    start: vi.fn(),
    command: vi.fn(),
    use: vi.fn(),
    catch: vi.fn(),
    api: {
      sendMessage: vi.fn().mockResolvedValue({}),
    },
  })),
}));

import { TelegramBotService } from '../../telegram/bot';

describe('TelegramBotService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
  });

  it('should fail initialization with missing config', () => {
    const service = TelegramBotService.getInstance({
      botToken: '',
    });
    const result = service.initialize();
    expect(result).toBe(false);
  });

  it('should manage user sessions', async () => {
    const service = TelegramBotService.getInstance({
      botToken: 'test-token',
    });
    const userId = 12345;
    await service.linkLicenseKey(userId, 'test-license-key');
    const session = await service.getUserSession(userId);
    expect(session).toBeDefined();
    expect(session?.licenseKeys).toContain('test-license-key');
  });

  it('should unlink license keys', async () => {
    const service = TelegramBotService.getInstance({
      botToken: 'test-token',
    });
    const userId = 12345;
    await service.linkLicenseKey(userId, 'key-to-remove');
    await service.unlinkLicenseKey(userId, 'key-to-remove');
    const session = await service.getUserSession(userId);
    expect(session?.licenseKeys).not.toContain('key-to-remove');
  });

  it('should be a singleton', () => {
    const service1 = TelegramBotService.getInstance({ botToken: 'tok' });
    const service2 = TelegramBotService.getInstance({ botToken: 'tok' });
    expect(service1).toBe(service2);
  });
});
