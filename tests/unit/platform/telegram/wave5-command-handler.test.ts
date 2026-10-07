/**
 * Wave V Telegram Command Handler & Routes Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Context, Bot } from 'grammy';
import {
  formatWave5Overview,
  formatWave5Status,
  formatWave5Performance,
  formatWave5Subscribe,
  handleWave5Overview,
  handleWave5StatusRoute,
  handleWave5PerformanceRoute,
  handleWave5SubscribeRoute,
  type Wave5Telemetry,
} from '../../../../src/platform/telegram/handlers/wave5-routes';
import {
  Wave5CommandHandler,
  registerWave5Commands,
} from '../../../../src/platform/telegram/wave5-command-handler';

function createMockContext(): { ctx: Context; replyMock: ReturnType<typeof vi.fn> } {
  const replyMock = vi.fn().mockResolvedValue({});
  const ctx = {
    reply: replyMock,
  } as unknown as Context;
  return { ctx, replyMock };
}

describe('Wave V Telegram Formatters & Handlers', () => {
  it('formats bilingual Wave 5 overview text with WCAG clean markdown', () => {
    const text = formatWave5Overview();
    expect(text).toContain('[EN]');
    expect(text).toContain('[VN]');
    expect(text).toContain('/wave5');
    expect(text).toContain('/performance');
    expect(text).toContain('3-Tier Swarm');
  });

  it('formats system status with live telemetry data', () => {
    const telemetry: Wave5Telemetry = {
      uptimeSeconds: 7200,
      activeAgentsCount: 3,
      consensusRatio: 0.95,
      openPositionsCount: 6,
    };
    const text = formatWave5Status(telemetry);
    expect(text).toContain('Uptime: 2h');
    expect(text).toContain('Active Swarm Nodes: 3');
    expect(text).toContain('95%');
    expect(text).toContain('Vị thế đang mở: 6');
  });

  it('formats desk performance with metrics', () => {
    const telemetry: Wave5Telemetry = {
      winRate30d: 72.5,
      profitFactor: 2.45,
      maxDrawdownPct: 2.1,
    };
    const text = formatWave5Performance(telemetry);
    expect(text).toContain('72.5%');
    expect(text).toContain('2.45');
    expect(text).toContain('-2.1%');
    expect(text).toContain('Hiệu suất Giao dịch');
  });

  it('formats subscription tiers with BASIC, PREMIUM, MASTER options', () => {
    const text = formatWave5Subscribe();
    expect(text).toContain('BASIC');
    expect(text).toContain('PREMIUM');
    expect(text).toContain('MASTER');
    expect(text).toContain('NOWPayments');
  });

  it('routes invoke ctx.reply with markdown parse_mode', async () => {
    const { ctx, replyMock } = createMockContext();

    await handleWave5Overview(ctx);
    expect(replyMock).toHaveBeenCalledWith(expect.stringContaining('Wave V'), { parse_mode: 'Markdown' });

    replyMock.mockClear();
    await handleWave5StatusRoute(ctx);
    expect(replyMock).toHaveBeenCalledWith(expect.stringContaining('Telemetry'), { parse_mode: 'Markdown' });

    replyMock.mockClear();
    await handleWave5PerformanceRoute(ctx);
    expect(replyMock).toHaveBeenCalledWith(expect.stringContaining('Performance'), { parse_mode: 'Markdown' });

    replyMock.mockClear();
    await handleWave5SubscribeRoute(ctx);
    expect(replyMock).toHaveBeenCalledWith(expect.stringContaining('Subscription'), { parse_mode: 'Markdown' });
  });
});

describe('Wave5CommandHandler Facade', () => {
  let handler: Wave5CommandHandler;
  const mockTelemetry: Wave5Telemetry = {
    uptimeSeconds: 3600,
    activeAgentsCount: 3,
    consensusRatio: 0.85,
    winRate30d: 70.0,
    profitFactor: 2.2,
    maxDrawdownPct: 3.0,
    openPositionsCount: 2,
  };

  beforeEach(() => {
    handler = new Wave5CommandHandler({
      telemetryProvider: async () => mockTelemetry,
    });
  });

  it('fetches telemetry from telemetryProvider', async () => {
    const tel = await handler.getTelemetry();
    expect(tel).toEqual(mockTelemetry);
  });

  it('handles telemetry error gracefully without throwing', async () => {
    const failingHandler = new Wave5CommandHandler({
      telemetryProvider: async () => {
        throw new Error('D1 connection failed');
      },
    });

    const tel = await failingHandler.getTelemetry();
    expect(tel).toBeUndefined();
  });

  it('dispatches commands accurately via dispatchCommand', async () => {
    const { ctx, replyMock } = createMockContext();

    expect(await handler.dispatchCommand('/wave5', ctx)).toBe(true);
    expect(replyMock).toHaveBeenCalledTimes(1);

    expect(await handler.dispatchCommand('status', ctx)).toBe(true);
    expect(replyMock).toHaveBeenCalledTimes(2);

    expect(await handler.dispatchCommand('/performance', ctx)).toBe(true);
    expect(replyMock).toHaveBeenCalledTimes(3);

    expect(await handler.dispatchCommand('/subscribe', ctx)).toBe(true);
    expect(replyMock).toHaveBeenCalledTimes(4);

    expect(await handler.dispatchCommand('/unknown', ctx)).toBe(false);
    expect(replyMock).toHaveBeenCalledTimes(4);
  });

  it('registers commands with grammy bot instance', () => {
    const registeredCommands: string[] = [];
    const mockBot = {
      command: vi.fn((cmd: string) => {
        registeredCommands.push(cmd);
      }),
    } as unknown as Bot<Context>;

    registerWave5Commands(mockBot);
    expect(registeredCommands).toContain('wave5');
    expect(registeredCommands).toContain('performance');
    expect(registeredCommands).toContain('subscribe');
  });
});
