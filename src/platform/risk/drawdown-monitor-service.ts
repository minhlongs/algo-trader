/**
 * Drawdown Monitor + Alert Service (Platform Layer)
 *
 * Wraps @desk/risk DrawdownMonitor with:
 * - 24h rolling P&L tracking
 * - Alert throttling (1 alert per 15min per user)
 * - Telegram + in-app alert dispatch
 * - D1 persistence for alert history
 * - Exposed via API response
 */

import { getRedisClient, type RedisClientType } from '../../redis';
import { logger } from '../../shared/utils/logger';
import { DrawdownMonitor, type DrawdownMetrics, type DrawdownAlert, type DrawdownConfig } from '@desk/risk';
import type { DrawdownRequest, DrawdownResponse } from './types';

const ALERT_THROTTLE_MS = 15 * 60 * 1000; // 15 minutes

export class DrawdownMonitorService {
  private monitor: DrawdownMonitor;
  private redis: RedisClientType;

  constructor(redis?: RedisClientType, config?: Partial<DrawdownConfig>) {
    this.redis = redis || getRedisClient();
    this.monitor = new DrawdownMonitor(this.redis, config);
  }

  /**
   * Record a trade result and get updated metrics.
   */
  async recordTrade(profit: number): Promise<DrawdownMetrics> {
    return this.monitor.recordTrade(profit);
  }

  /**
   * Get current drawdown metrics + 24h rolling P&L history.
   */
  async getStatus(userId: string): Promise<DrawdownResponse> {
    const metrics = await this.monitor.getMetrics();
    const history = await this.monitor.getDailyHistory(24);
    const alerts = await this.monitor.getAlerts();

    return {
      success: true,
      data: {
        ...metrics,
        history,
        alerts: alerts.slice(0, 50),
      },
    };
  }

  /**
   * Check drawdown against thresholds and fire throttled alerts.
   * Returns any alerts that crossed thresholds.
   */
  async checkAndAlert(
    userId: string,
    request: DrawdownRequest,
  ): Promise<{ alerts: DrawdownAlert[]; throttled: boolean }> {
    const metrics = await this.monitor.getMetrics();
    const alerts: DrawdownAlert[] = [];
    const throttleKey = `risk:alert:throttle:${userId}`;

    // Check throttling
    const lastAlert = await this.redis.get(throttleKey);
    if (lastAlert) {
      const elapsed = Date.now() - parseInt(lastAlert, 10);
      if (elapsed < ALERT_THROTTLE_MS) {
        return { alerts: [], throttled: true };
      }
    }

    // Daily drawdown check
    const dailyThreshold = request.dailyThreshold ?? 0.05;
    if (metrics.dailyDrawdown >= dailyThreshold) {
      alerts.push({
        type: 'daily',
        threshold: dailyThreshold,
        current: metrics.dailyDrawdown,
        triggeredAt: Date.now(),
        message: `Daily drawdown ${(metrics.dailyDrawdown * 100).toFixed(2)}% exceeds ${(dailyThreshold * 100).toFixed(2)}% threshold`,
      });
    }

    // Total drawdown check
    const totalThreshold = request.totalThreshold ?? 0.15;
    if (metrics.currentDrawdown >= totalThreshold) {
      alerts.push({
        type: 'total',
        threshold: totalThreshold,
        current: metrics.currentDrawdown,
        triggeredAt: Date.now(),
        message: `Total drawdown ${(metrics.currentDrawdown * 100).toFixed(2)}% exceeds ${(totalThreshold * 100).toFixed(2)}% threshold`,
      });
    }

    if (alerts.length > 0) {
      // Set throttle
      await this.redis.set(throttleKey, Date.now().toString());

      // Persist alerts
      for (const alert of alerts) {
        await this.persistAlert(userId, alert);
      }

      // Dispatch via Telegram (non-blocking)
      this.dispatchTelegramAlerts(userId, alerts).catch((err) => {
        logger.warn('[DrawdownMonitorService] Telegram dispatch failed', { error: String(err) });
      });
    }

    return { alerts, throttled: false };
  }

  /**
   * Check if trading is currently allowed.
   */
  async canTrade(): Promise<boolean> {
    return this.monitor.canTrade();
  }

  /**
   * Resume trading after a halt.
   */
  async resume(): Promise<void> {
    await this.monitor.resume();
  }

  /**
   * Initialize day tracking.
   */
  async initializeDay(): Promise<void> {
    await this.monitor.initializeDay();
  }

  /**
   * Persist alert to D1 (or Redis fallback).
   */
  private async persistAlert(userId: string, alert: DrawdownAlert): Promise<void> {
    try {
      const key = `risk:alerts:${userId}`;
      const record = {
        ...alert,
        userId,
        persistedAt: Date.now(),
      };
      await this.redis.lpush(key, JSON.stringify(record));
      await this.redis.ltrim(key, 0, 199); // keep last 200
      await this.redis.expire(key, 86400 * 30); // 30 days
    } catch (err) {
      logger.warn('[DrawdownMonitorService] Persist alert failed', { error: String(err) });
    }
  }

  /**
   * Dispatch alerts via Telegram bot.
   * Looks up user's linked Telegram chat ID and sends formatted alerts.
   */
  private async dispatchTelegramAlerts(userId: string, alerts: DrawdownAlert[]): Promise<void> {
    // Telegram dispatch is best-effort — failure doesn't block the API response
    try {
      const chatId = await this.getTelegramChatId(userId);
      if (!chatId) return;

      for (const alert of alerts) {
        const text = [
          '⚠️ *Drawdown Alert*',
          '',
          alert.message,
          `Threshold: ${(alert.threshold * 100).toFixed(2)}%`,
          `Current: ${(alert.current * 100).toFixed(2)}%`,
          `Time: ${new Date(alert.triggeredAt).toISOString()}`,
        ].join('\n');

        await this.sendTelegramMessage(chatId, text);
      }
    } catch {
      // swallow — Telegram is non-critical
    }
  }

  private async getTelegramChatId(userId: string): Promise<string | null> {
    try {
      const val = await this.redis.get(`telegram:chat:${userId}`);
      return val ?? null;
    } catch {
      return null;
    }
  }

  private async sendTelegramMessage(chatId: string, text: string): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' });

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  }
}
