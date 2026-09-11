import type { DeskStrategySeed } from './desk-strategy-seeder-types';

export const DESK_STRATEGIES: DeskStrategySeed[] = [
  {
    id: 'cross-platform-arb',
    name: 'Cross-Platform Arbitrage',
    description:
      'Multi-platform arbitrage across Polymarket, Kalshi, and CEX feeds. Detects price discrepancies between venues and captures spread before convergence. Real-time WebSocket + HTTP polling.',
    category: 'arbitrage',
    riskLevel: 6,
    priceUsdMonthly: 14900, // $149/mo
    tags: ['arbitrage', 'cross-platform', 'polymarket', 'kalshi', 'cex'],
    backtestSummary: { sharpe: 1.8, maxDrawdown: 8, winRate: 62, periodDays: 90, totalTrades: 340, totalPnlUsd: 12500 },
  },
  {
    id: 'whale-copy-trader',
    name: 'Whale Copy Trader',
    description:
      'Tracks whale wallets on Polymarket and copies their trades at fractional size. Per-wallet accuracy tracking filters signal from noise. Enter when whales with proven track records move.',
    category: 'statistical',
    riskLevel: 5,
    priceUsdMonthly: 9900, // $99/mo
    tags: ['whale', 'copy-trading', 'polymarket', 'onchain'],
    backtestSummary: { sharpe: 1.5, maxDrawdown: 12, winRate: 58, periodDays: 120, totalTrades: 520, totalPnlUsd: 9800 },
  },
  {
    id: 'delta-neutral-vol-arb',
    name: 'Delta-Neutral Volatility Arbitrage',
    description:
      'Delta-neutral volatility arbitrage using correlated market pairs. Opens hedged positions (long YES + long NO on correlated markets), monitors net delta, rebalances when threshold breached.',
    category: 'arbitrage',
    riskLevel: 4,
    priceUsdMonthly: 12900, // $129/mo
    tags: ['delta-neutral', 'volatility', 'arbitrage', 'polymarket', 'pairs', 'featured'],
    backtestSummary: { sharpe: 2.1, maxDrawdown: 6, winRate: 65, periodDays: 90, totalTrades: 210, totalPnlUsd: 15600 },
  },
  {
    id: 'resolution-frontrunner',
    name: 'Resolution Frontrunner',
    description:
      'Front-runs market resolution by detecting strongly directional prices near endDate. When price > 0.85, buys YES expecting convergence to 1. When price < 0.15, buys NO expecting convergence to 0.',
    category: 'statistical',
    riskLevel: 3,
    priceUsdMonthly: 7900, // $79/mo
    tags: ['resolution', 'convergence', 'polymarket', 'low-risk', 'featured'],
    backtestSummary: { sharpe: 2.4, maxDrawdown: 4, winRate: 72, periodDays: 180, totalTrades: 180, totalPnlUsd: 8800 },
  },
  {
    id: 'listing-arbitrage-sniper',
    name: 'Listing Arbitrage Sniper',
    description:
      'Detects newly listed Polymarket markets with wide spreads and enters before liquidity concentrates. Exits when volume arrives or spread converges. Max 3 concurrent positions, Kelly-adjusted sizing.',
    category: 'arbitrage',
    riskLevel: 4,
    priceUsdMonthly: 7900, // $79/mo
    tags: ['listing', 'arbitrage', 'polymarket', 'new-markets', 'sniper'],
    backtestSummary: { sharpe: 1.9, maxDrawdown: 7, winRate: 60, periodDays: 60, totalTrades: 120, totalPnlUsd: 6200 },
  },
  {
    id: 'cycle-end-sniper',
    name: 'Cycle End Sniper',
    description:
      'Times entries in the final 30-60 seconds before market resolution. When price strongly predicts outcome (>0.95 or <0.05), enters for near-certain payout with minimal exposure time.',
    category: 'statistical',
    riskLevel: 3,
    priceUsdMonthly: 8900, // $89/mo
    tags: ['cycle', 'sniper', 'polymarket', 'timing', 'resolution', 'featured'],
    backtestSummary: { sharpe: 2.6, maxDrawdown: 3, winRate: 78, periodDays: 120, totalTrades: 280, totalPnlUsd: 7200 },
  },
  {
    id: 'delta-neutral-volatility-arbitrage',
    name: 'Delta-Neutral Volatility Arbitrage',
    description:
      'Delta-neutral volatility arbitrage using correlated market pairs. Opens hedged positions (long YES + long NO on correlated markets), monitors net delta, rebalances when threshold breached.',
    category: 'arbitrage',
    riskLevel: 4,
    priceUsdMonthly: 12900, // $129/mo
    tags: ['delta-neutral', 'volatility', 'arbitrage', 'polymarket', 'pairs'],
    backtestSummary: { sharpe: 2.1, maxDrawdown: 6, winRate: 65, periodDays: 90, totalTrades: 210, totalPnlUsd: 15600 },
  },
  {
    id: 'cross-event-drift-v2',
    name: 'Cross-Event Drift',
    description:
      'Detects significant moves in one market of an event group and trades the lagging correlated markets, expecting them to catch up. Uses gamma.getEvents() for group detection.',
    category: 'statistical',
    riskLevel: 4,
    priceUsdMonthly: 7900, // $79/mo
    tags: ['cross-event', 'drift', 'polymarket', 'correlation', 'event-group'],
    backtestSummary: { sharpe: 1.7, maxDrawdown: 9, winRate: 59, periodDays: 90, totalTrades: 150, totalPnlUsd: 5500 },
  },
  {
    id: 'resolution-frontrunner-v2',
    name: 'Resolution Frontrunner',
    description:
      'Front-runs market resolution by detecting strongly directional prices near endDate. When price > 0.85, buys YES expecting convergence to 1. When price < 0.15, buys NO expecting convergence to 0.',
    category: 'statistical',
    riskLevel: 3,
    priceUsdMonthly: 7900, // $79/mo
    tags: ['resolution', 'convergence', 'polymarket', 'low-risk'],
    backtestSummary: { sharpe: 2.4, maxDrawdown: 4, winRate: 72, periodDays: 180, totalTrades: 180, totalPnlUsd: 8800 },
  },
];
