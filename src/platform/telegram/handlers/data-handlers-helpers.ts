import { getRedisClient } from '../../../redis';

export interface AggregatedPnlStats {
  totalRealized: number;
  totalUnrealized: number;
  totalTrades: number;
  totalWins: number;
  losses: number;
  winRate: string;
  totalPnl: number;
}

export async function aggregateRedisPnlForKeys(
  licenseKeys: string[]
): Promise<AggregatedPnlStats> {
  const redis = getRedisClient();
  let totalRealized = 0;
  let totalUnrealized = 0;
  let totalTrades = 0;
  let totalWins = 0;

  for (const key of licenseKeys) {
    try {
      const pnlData = await redis.hgetall(`pnl:${key}`);
      if (pnlData && pnlData.realized != null) {
        totalRealized += parseFloat((pnlData.realized as string) || '0');
        totalUnrealized += parseFloat((pnlData.unrealized as string) || '0');
        totalTrades += parseInt((pnlData.totalTrades as string) || '0', 10);
        totalWins += parseInt((pnlData.winningTrades as string) || '0', 10);
      }
    } catch {
      // Skip keys with no P&L data
    }
  }

  const winRate =
    totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(1) : '0';
  const losses = totalTrades - totalWins;
  const totalPnl = totalRealized + totalUnrealized;

  return {
    totalRealized,
    totalUnrealized,
    totalTrades,
    totalWins,
    losses,
    winRate,
    totalPnl,
  };
}
