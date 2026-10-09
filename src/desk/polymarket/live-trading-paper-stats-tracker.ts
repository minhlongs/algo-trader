/**
 * Live Trading Paper Stats & Profile Tracker
 */

import type { PaperTradeStats } from './live-trading-types';
import type { StrategyPaperProfile } from './live-trading-gating-types';

export class LiveTradingPaperStatsTracker {
  private paperStats = new Map<string, PaperTradeStats>();
  private paperProfiles = new Map<string, StrategyPaperProfile>();

  registerPaperProfile(profile: StrategyPaperProfile): void {
    this.paperProfiles.set(profile.strategyKey, { ...profile });
  }

  getPaperProfile(strategyKey: string): StrategyPaperProfile | undefined {
    return this.paperProfiles.get(strategyKey);
  }

  getOrCreateProfile(strategyKey: string, currentTimeMs: number): StrategyPaperProfile {
    let profile = this.paperProfiles.get(strategyKey);
    if (!profile) {
      const stats = this.paperStats.get(strategyKey) ?? { paperTrades: 0, paperPnl: 0 };
      profile = {
        strategyKey,
        paperStartDate: currentTimeMs,
        totalPaperTrades: stats.paperTrades,
        winningTrades: stats.paperPnl > 0 ? stats.paperTrades : 0,
        losingTrades: stats.paperPnl < 0 ? stats.paperTrades : 0,
        grossProfitUsd: stats.paperPnl > 0 ? stats.paperPnl : 0,
        grossLossUsd: stats.paperPnl < 0 ? Math.abs(stats.paperPnl) : 0,
        maxDrawdown: 0.0,
        sharpeRatio: 0.0,
      };
      this.paperProfiles.set(strategyKey, profile);
    }
    return profile;
  }

  updatePaperPnl(strategyKey: string, pnlDelta: number): void {
    const stats = this.paperStats.get(strategyKey) ?? { paperTrades: 0, paperPnl: 0 };
    stats.paperPnl += pnlDelta;
    this.paperStats.set(strategyKey, stats);

    const profile = this.paperProfiles.get(strategyKey);
    if (profile) {
      if (pnlDelta > 0) {
        profile.winningTrades += 1;
        profile.grossProfitUsd += pnlDelta;
      } else if (pnlDelta < 0) {
        profile.losingTrades += 1;
        profile.grossLossUsd += Math.abs(pnlDelta);
      }
      this.paperProfiles.set(strategyKey, profile);
    }
  }

  recordPaperTrade(strategyKey: string): void {
    const stats = this.paperStats.get(strategyKey) ?? { paperTrades: 0, paperPnl: 0 };
    stats.paperTrades += 1;
    this.paperStats.set(strategyKey, stats);

    const profile = this.paperProfiles.get(strategyKey);
    if (profile) {
      profile.totalPaperTrades += 1;
      this.paperProfiles.set(strategyKey, profile);
    }
  }

  getPaperStats(): ReadonlyMap<string, PaperTradeStats> {
    return this.paperStats;
  }

  restorePaperStats(entries: Array<[string, { paperTrades: number; paperPnl: number }]>): void {
    this.paperStats = new Map(entries);
  }

  clear(): void {
    this.paperStats.clear();
    this.paperProfiles.clear();
  }
}
