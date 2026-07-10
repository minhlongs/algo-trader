import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LeadHunterAgent } from '../../src/agentic/lead-hunter';
import { UserLinkStore } from '../../src/platform/telegram/user-link-store';

function makeMockApi(): Record<string, ReturnType<typeof vi.fn>> {
  return {
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };
}

describe('LeadHunterAgent', () => {
  let store: UserLinkStore;
  let agent: LeadHunterAgent;
  let api: ReturnType<typeof makeMockApi>;

  beforeEach(() => {
    UserLinkStore.resetInstance();
    vi.clearAllMocks();
    store = new UserLinkStore();
    api = makeMockApi();
    agent = new LeadHunterAgent(store, api);
  });

  describe('detectChurnRisk', () => {
    it('flags inactive 7d as medium', () => {
      const signals = agent.detectChurnRisk(1, 7);
      expect(signals.some((s) => s.reason === 'inactive_7d' && s.severity === 'medium')).toBe(true);
    });

    it('flags inactive 14d as high', () => {
      const signals = agent.detectChurnRisk(1, 14);
      expect(signals.some((s) => s.reason === 'inactive_7d' && s.severity === 'high')).toBe(true);
    });

    it('flags trial ending in 1 day as high', () => {
      const signals = agent.detectChurnRisk(1, 0, 1);
      expect(signals.some((s) => s.reason === 'trial_ending' && s.severity === 'high')).toBe(true);
    });

    it('flags trial ending in 3 days as medium', () => {
      const signals = agent.detectChurnRisk(1, 0, 3);
      expect(signals.some((s) => s.reason === 'trial_ending' && s.severity === 'medium')).toBe(true);
    });

    it('returns low severity for healthy active user', () => {
      const signals = agent.detectChurnRisk(1, 1);
      expect(signals.every((s) => s.severity === 'low')).toBe(true);
    });
  });

  describe('sendDailyCheckIn', () => {
    it('sends to every user with rate limiting', async () => {
      const ids = [101, 102, 103];
      const result = await agent.sendDailyCheckIn(ids);

      expect(result.sent).toBe(3);
      expect(result.failed).toBe(0);
      expect(api.sendMessage).toHaveBeenCalledTimes(3);
      ids.forEach((id) =>
        expect(api.sendMessage).toHaveBeenCalledWith(id, expect.any(String), { parse_mode: 'Markdown' }),
      );
    });

    it('counts failures when send throws', async () => {
      const failApi = { sendMessage: vi.fn().mockRejectedValue(new Error('Network error')) };
      const failAgent = new LeadHunterAgent(store, failApi);
      const result = await failAgent.sendDailyCheckIn([201, 202]);

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(2);
    });
  });

  describe('onNewSignup', () => {
    it('links user and sends welcome DM', async () => {
      await agent.onNewSignup(42, 'lic-test-123');

      const link = store.getByTelegramUserId(42);
      expect(link).toBeDefined();
      expect(link!.licenseId).toBe('lic-test-123');
      expect(link!.linkedAt).toBeTruthy();
      expect(api.sendMessage).toHaveBeenCalledWith(42, expect.stringContaining('Welcome'), {
        parse_mode: 'Markdown',
      });
    });

    it('does not send duplicate welcome on repeat signup', async () => {
      await agent.onNewSignup(42, 'lic-test-123');
      api.sendMessage.mockClear();
      await agent.onNewSignup(42, 'lic-test-123');

      expect(api.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('escalateToHuman', () => {
    it('does not throw and logs', async () => {
      await expect(agent.escalateToHuman('lic-1', 'inactive 30d')).resolves.toBeUndefined();
    });
  });
});
