/**
 * Wave V Command Handler Facade
 *
 * Directs incoming Telegram interactions for Wave V commands (/wave5, /status,
 * /performance, /subscribe) to bilingual formatters with live telemetry.
 */

import type { Bot, Context } from 'grammy';
import { logger } from '../../shared/utils/logger';
import {
  handleWave5Overview,
  handleWave5StatusRoute,
  handleWave5PerformanceRoute,
  handleWave5SubscribeRoute,
  type Wave5Telemetry,
} from './handlers/wave5-routes';

export type TelemetryProvider = () => Promise<Wave5Telemetry> | Wave5Telemetry;

export interface Wave5HandlerOptions {
  telemetryProvider?: TelemetryProvider;
}

export class Wave5CommandHandler {
  private readonly telemetryProvider?: TelemetryProvider;

  constructor(options: Wave5HandlerOptions = {}) {
    this.telemetryProvider = options.telemetryProvider;
  }

  public async getTelemetry(): Promise<Wave5Telemetry | undefined> {
    if (!this.telemetryProvider) return undefined;
    try {
      return await this.telemetryProvider();
    } catch (err) {
      logger.warn(`[Wave5CommandHandler] Failed to fetch telemetry: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  }

  public async handleWave5(ctx: Context): Promise<void> {
    await handleWave5Overview(ctx);
  }

  public async handleStatus(ctx: Context): Promise<void> {
    const telemetry = await this.getTelemetry();
    await handleWave5StatusRoute(ctx, telemetry);
  }

  public async handlePerformance(ctx: Context): Promise<void> {
    const telemetry = await this.getTelemetry();
    await handleWave5PerformanceRoute(ctx, telemetry);
  }

  public async handleSubscribe(ctx: Context): Promise<void> {
    await handleWave5SubscribeRoute(ctx);
  }

  public async dispatchCommand(rawCommand: string, ctx: Context): Promise<boolean> {
    const cmd = rawCommand.trim().toLowerCase().replace(/^\//, '');
    switch (cmd) {
      case 'wave5':
        await this.handleWave5(ctx);
        return true;
      case 'status':
        await this.handleStatus(ctx);
        return true;
      case 'performance':
        await this.handlePerformance(ctx);
        return true;
      case 'subscribe':
        await this.handleSubscribe(ctx);
        return true;
      default:
        return false;
    }
  }

  public register(bot: Bot<Context>): void {
    bot.command('wave5', (ctx) => this.handleWave5(ctx));
    bot.command('performance', (ctx) => this.handlePerformance(ctx));
    bot.command('subscribe', (ctx) => this.handleSubscribe(ctx));
    logger.info('[Wave5CommandHandler] Wave V commands registered (/wave5, /performance, /subscribe)');
  }
}

export function registerWave5Commands(bot: Bot<Context>, options?: Wave5HandlerOptions): Wave5CommandHandler {
  const handler = new Wave5CommandHandler(options);
  handler.register(bot);
  return handler;
}
