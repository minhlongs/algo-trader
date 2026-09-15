/**
 * Fixtures and mock helpers for ask-handler test suites.
 */
import { vi, type Mock } from 'vitest';
import type { Context } from 'grammy';

export const MODULE_PATH = '../ask-handler';

export interface MockTelegramContext {
  reply: Mock;
  replyWithChatAction: Mock;
}

export function createMockContext(): { ctx: Context; mocks: MockTelegramContext } {
  const reply = vi.fn();
  const replyWithChatAction = vi.fn();
  const ctx = {
    reply,
    replyWithChatAction,
  } as unknown as Context;
  return { ctx, mocks: { reply, replyWithChatAction } };
}

export function setupEnv(apiKey: string, baseUrl = 'http://localhost:3000'): void {
  process.env.TELEGRAM_COPILOT_API_KEY = apiKey;
  process.env.API_BASE_URL = baseUrl;
}

export function restoreEnv(originalEnv: NodeJS.ProcessEnv): void {
  process.env = originalEnv;
}
