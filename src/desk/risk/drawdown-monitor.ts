/**
 * Drawdown Monitor
 * Halts trading on max drawdown breach
 */

import { getRedisClient, type RedisClientType } from '../../redis';
import { logger } from '../../shared/utils/logger';
import type { DrawdownConfig, DrawdownMetrics, DrawdownAlert } from './drawdown-monitor-types';
import { writeDrawdownAudit } from './drawdown-monitor-types';

export type { DrawdownConfig, DrawdownMetrics, DrawdownAlert };

export class DrawdownMonitor {
  private redis: RedisClientType;
  private config: DrawdownConfig;

  constructor(redis?: RedisClientType, config?: Partial<DrawdownConfig>) {
    this.redis = redis || getRedisClient();
    this.config = { maxDailyDrawdown: 0.05, maxTotalDrawdown: 0.15, maxConsecutiveLoss: 5, haltOnBreach: true, ...config };
  }

  async recordTrade(profit: number): Promise<DrawdownMetrics> {
    const state = await this.getState();
    const newValue = state.currentValue + profit;
    const newPeak = Math.max(state.peakValue, newValue);
    const dailyStart = parseFloat(await this.redis.get('drawdown:daily_start') || state.currentValue.toString());
    const totalDrawdown = (newPeak - newValue) / newPeak;
    const dailyDrawdown = (dailyStart - newValue) / dailyStart;
    const consecutiveLosses = profit < 0 ? state.consecutiveLosses + 1 : 0;

    await this.redis.hset('drawdown:state', { currentValue: newValue.toString(), peakValue: newPeak.toString(), consecutiveLosses: consecutiveLosses.toString() });
    const today = new Date().toISOString().split('T')[0];
    const dailyPnl = parseFloat(await this.redis.get(`drawdown:daily:${today}`) || '0') + profit;
    await this.redis.set(`drawdown:daily:${today}`, dailyPnl.toString());

    const metrics: DrawdownMetrics = {
      currentDrawdown: totalDrawdown, maxDrawdown: (newPeak - Math.min(state.currentValue, newValue)) / newPeak,
      peakValue: newPeak, currentValue: newValue, dailyPnl, dailyDrawdown, consecutiveLosses,
      isHalted: (await this.redis.hgetall('drawdown:halt')).state === 'HALTED',
    };

    if (this.config.haltOnBreach) {
      if (dailyDrawdown >= this.config.maxDailyDrawdown) await this.halt(`Daily drawdown ${(dailyDrawdown * 100).toFixed(2)}% breached`);
      else if (totalDrawdown >= this.config.maxTotalDrawdown) await this.halt(`Total drawdown ${(totalDrawdown * 100).toFixed(2)}% breached`);
      else if (consecutiveLosses >= this.config.maxConsecutiveLoss) await this.halt(`${consecutiveLosses} consecutive losses`);
    }

    return metrics;
  }

  async getMetrics(): Promise<DrawdownMetrics> {
    const state = await this.getState();
    const dailyStart = parseFloat(await this.redis.get('drawdown:daily_start') || state.currentValue.toString());
    return {
      currentDrawdown: (state.peakValue - state.currentValue) / state.peakValue,
      maxDrawdown: 0, peakValue: state.peakValue, currentValue: state.currentValue,
      dailyPnl: state.currentValue - dailyStart,
      dailyDrawdown: (dailyStart - state.currentValue) / dailyStart,
      consecutiveLosses: state.consecutiveLosses,
      isHalted: (await this.redis.hgetall('drawdown:halt')).state === 'HALTED',
    };
  }

  async canTrade(): Promise<boolean> {
    return (await this.redis.hgetall('drawdown:halt')).state !== 'HALTED';
  }

  async halt(reason: string): Promise<void> {
    await this.redis.hset('drawdown:halt', { state: 'HALTED', reason, triggeredAt: Date.now().toString() });
    await writeDrawdownAudit('drawdown_halt', 'failure', { state: 'HALTED', triggeredAt: Date.now(), reason });
    logger.warn(`[DrawdownMonitor] HALTED: ${reason}`);
  }

  async resume(): Promise<void> {
    await this.redis.hset('drawdown:halt', { state: 'ACTIVE', reason: '', triggeredAt: '' });
    const state = await this.getState();
    await this.redis.set('drawdown:daily_start', state.currentValue.toString());
    await writeDrawdownAudit('drawdown_resume', 'success', { state: 'ACTIVE' });
    logger.info('[DrawdownMonitor] RESUMED');
  }

  async initializeDay(): Promise<void> {
    const state = await this.getState();
    const today = new Date().toISOString().split('T')[0];
    await this.redis.set('drawdown:daily_start', state.currentValue.toString());
    await this.redis.set(`drawdown:daily:${today}`, '0');
    await this.redis.del('drawdown:alerts');
    logger.info(`[DrawdownMonitor] Day initialized @ ${state.currentValue}`);
  }

  async getAlerts(): Promise<DrawdownAlert[]> {
    const alerts = await this.redis.lrange('drawdown:alerts', 0, -1);
    return alerts.map((a) => JSON.parse(a));
  }

  async getDailyHistory(days = 30): Promise<{ date: string; pnl: number }[]> {
    const history: { date: string; pnl: number }[] = [];
    const today = new Date();
    for (let i = 0; i < days; i++) {
      const date = new Date(today); date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      history.push({ date: dateStr, pnl: parseFloat(await this.redis.get(`drawdown:daily:${dateStr}`) || '0') });
    }
    return history;
  }

  private async getState(): Promise<{ currentValue: number; peakValue: number; consecutiveLosses: number }> {
    const data = await this.redis.hgetall('drawdown:state');
    return { currentValue: parseFloat(data.currentValue || '100'), peakValue: parseFloat(data.peakValue || '100'), consecutiveLosses: parseInt(data.consecutiveLosses || '0') };
  }
}
