import type { PaperTrade, PaperPortfolio } from '../../desk/wiring/paper-trading-orchestrator';
import type { WhaleActivity } from '../../desk/feeds/whale-activity-feed';

export function truncate(text: string, maxLen = 40): string {
  return text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;
}

export function sign(n: number): string {
  return n >= 0 ? '+' : '';
}

export function formatTradeAlert(trade: PaperTrade): string {
  const side = trade.side === 'YES' ? '🟢' : '🔴';
  const stratLabel = trade.strategy ? ` | _${trade.strategy}_` : '';
  const edge = (trade.signalConfidence * 100).toFixed(1);

  return [
    `${side} *OPEN: ${trade.side}* @${trade.entryPrice.toFixed(3)}`,
    `📌 _${truncate(trade.marketId, 32)}_`,
    `Edge: ${edge}% | Size: $${trade.size.toFixed(0)}${stratLabel}`,
  ].join('\n');
}

export function formatPnlSummary(portfolio: PaperPortfolio): string {
  const totalTrades = portfolio.winCount + portfolio.lossCount;
  const winRate = totalTrades > 0
    ? ((portfolio.winCount / totalTrades) * 100).toFixed(1)
    : '0.0';

  const pnlSign = sign(portfolio.totalPnl);
  return [
    `📊 *Paper P&L Report*`,
    `Total P&L: *${pnlSign}$${Math.abs(portfolio.totalPnl).toFixed(2)}*`,
    `Win rate: ${winRate}% (${portfolio.winCount}W / ${portfolio.lossCount}L)`,
    `Open positions: ${portfolio.positions.length}`,
    `Capital: $${portfolio.capital.toFixed(2)}`,
  ].join('\n');
}

export function formatWhaleAlert(whale: WhaleActivity): string {
  const side = whale.side === 'YES' ? '🟢' : '🔴';
  const shortWallet = whale.walletAddress.length > 10
    ? whale.walletAddress.slice(0, 6) + '…' + whale.walletAddress.slice(-4)
    : whale.walletAddress;

  return [
    `🐋 *Whale Alert* ${side} ${whale.side}`,
    `Size: *$${whale.size.toLocaleString()}* @${whale.price.toFixed(3)}`,
    `Market: \`${truncate(whale.marketId, 32)}\``,
    `Wallet: \`${shortWallet}\``,
  ].join('\n');
}
