/**
 * LeaderboardRow
 *
 * Single row in the leaderboard table showing strategy rank, metrics,
 * and performance badge. Color-coded: green for top quartile, red for bottom.
 */
import type { LeaderboardEntry } from '../../types/api';
import { LeaderboardBadge } from './leaderboard-badge';

interface LeaderboardRowProps {
  entry: LeaderboardEntry;
  rank: number;
}

function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  const formatted = abs >= 1000
    ? abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : abs.toFixed(2);
  return (n < 0 ? '-' : '') + '$' + formatted;
}

function fmtPercent(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function pnlClass(v: number): string {
  return v > 0 ? 'text-profit' : v < 0 ? 'text-loss' : 'text-muted';
}

const RANK_MEDAL: Record<number, string> = {
  1: 'text-gold',
  2: 'text-silver',
  3: 'text-bronze',
};

export function LeaderboardRow({ entry, rank }: LeaderboardRowProps) {
  const { strategyName: strategy, winRate, sharpeRatio: sharpe, pnl = 0, maxDrawdown: drawdown, totalTrades: trades, badge } = entry;
  const medalColor = RANK_MEDAL[rank] ?? 'text-muted';

  return (
    <tr className={`border-b border-bg-border/50 hover:bg-bg-surface/60 transition-colors ${rank <= 3 ? 'bg-bg-surface/40' : ''}`}>
      {/* Rank */}
      <td className="px-3 py-2.5">
        <span className={`font-mono text-sm font-bold ${rank <= 3 ? medalColor : 'text-muted'}`}>
          {rank}
        </span>
      </td>

      {/* Strategy Name */}
      <td className="px-3 py-2.5">
        <span className="text-white font-medium text-sm capitalize whitespace-nowrap">
          {strategy.replace(/-/g, ' ')}
        </span>
      </td>

      {/* Win Rate */}
      <td className={`px-3 py-2.5 text-right font-mono text-sm tabular-nums ${winRate >= 0 ? 'text-profit' : 'text-loss'}`}>
        {fmtPercent(winRate)}
      </td>

      {/* Sharpe */}
      <td className={`px-3 py-2.5 text-right font-mono text-sm tabular-nums ${sharpe >= 1 ? 'text-profit' : sharpe > 0 ? 'text-muted' : 'text-loss'}`}>
        {sharpe.toFixed(2)}
      </td>

      {/* P&L */}
      <td className={`px-3 py-2.5 text-right font-mono text-sm tabular-nums font-semibold ${pnlClass(pnl)}`}>
        {fmtUsd(pnl)}
      </td>

      {/* Drawdown */}
      <td className="px-3 py-2.5 text-right font-mono text-sm tabular-nums text-loss">
        {fmtPercent(drawdown)}
      </td>

      {/* Trades */}
      <td className="px-3 py-2.5 text-right font-mono text-sm tabular-nums text-white">
        {trades.toLocaleString()}
      </td>

      {/* Badge */}
      <td className="px-3 py-2.5">
        {badge ? <LeaderboardBadge badge={badge} /> : null}
      </td>
    </tr>
  );
}
