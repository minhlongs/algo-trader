/**
 * Fixtures and helpers for leaderboard-handler test suites.
 */
import { vi, type Mock } from 'vitest';
import type { Context } from 'grammy';

export const MODULE_PATH = '../leaderboard-handler';

export interface MockTelegramContext {
  reply: Mock;
}

export function createMockContext(): { ctx: Context; mocks: MockTelegramContext } {
  const reply = vi.fn();
  const ctx = { reply } as unknown as Context;
  return { ctx, mocks: { reply } };
}

export function setupEnv(apiKey: string, baseUrl = 'http://localhost:3000'): void {
  process.env.TELEGRAM_COPILOT_API_KEY = apiKey;
  process.env.API_BASE_URL = baseUrl;
}

export function restoreEnv(originalEnv: NodeJS.ProcessEnv): void {
  process.env = originalEnv;
}

export function getSampleStrategiesPayload() {
  return {
    strategies: [
      { name: 'AlphaStrategy', winRate: 0.72, sharpe: 1.45 },
      { name: 'BetaTrader', winRate: 0.68, sharpe: 1.22 },
      { name: 'GammaFund', winRate: 0.65, sharpe: 1.35 },
      { name: 'DeltaSys', winRate: 0.61, sharpe: 1.10 },
      { name: 'EpsilonBot', winRate: 0.58, sharpe: 0.95 },
    ],
  };
}
