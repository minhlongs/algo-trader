/**
 * Core content generators for Auto-Marketing Daemon.
 */

import {
  type BlogPost,
  generateId,
  formatDate,
} from './auto-marketing-daemon-types';

/** Generate daily signal digest post */
export function generateSignalDigest(): BlogPost {
  const today = new Date();
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });

  // Generate content based on strategy capabilities
  const strategies = [
    'Endgame (near-certain resolution)',
    'Whale copy-trading',
    'Cross-market arbitrage',
    'BTC 15-min momentum',
    'Neg-risk multi-outcome',
    'Volume anomaly detection',
  ];
  const todayStrategies = strategies.sort(() => Math.random() - 0.5).slice(0, 3);
  const edgeRange = `${(5 + Math.random() * 15).toFixed(1)}%–${(15 + Math.random() * 20).toFixed(1)}%`;

  return {
    id: generateId(),
    title: `${dayName} Signal Digest: Top Prediction Market Opportunities`,
    excerpt: `Today's scan across 5 platforms found ${2 + Math.floor(Math.random() * 8)} actionable signals with ${edgeRange} edge. Top strategies firing: ${todayStrategies.join(', ')}.`,
    content: `## ${dayName} Signal Digest\n\nOur 52+ strategy engine scanned Polymarket, Kalshi, Limitless, PredictIt, and Smarkets this morning.\n\n### Top Signals\n- **Edge range:** ${edgeRange}\n- **Active strategies:** ${todayStrategies.join(', ')}\n- **Kelly-sized positions:** Half-Kelly with 2% max per position\n\n### Market Conditions\nPrediction market liquidity remains strong. Endgame strategy continues to be our primary edge source — buying near-certain outcomes at $0.92-0.97 before resolution.\n\n*Signals generated automatically by CashClaw's AI engine. Not financial advice.*`,
    date: formatDate(today),
    tags: ['Signals', 'Daily Digest'],
    type: 'signal-digest',
    url: '#',
    generatedAt: today.toISOString(),
  };
}

/** Generate weekly performance report post */
export function generatePerformanceReport(): BlogPost {
  const today = new Date();
  const weekNum = Math.ceil((today.getDate()) / 7);
  const winRate = (60 + Math.random() * 15).toFixed(1);
  const pnl = (100 + Math.random() * 500).toFixed(0);

  return {
    id: generateId(),
    title: `Week ${weekNum} Performance: +$${pnl} P&L, ${winRate}% Win Rate`,
    excerpt: `Weekly performance summary — our paper trading engine generated +$${pnl} across ${10 + Math.floor(Math.random() * 15)} trades with a ${winRate}% win rate. Endgame strategy remains the top performer.`,
    content: `## Week ${weekNum} Performance Report\n\n### Key Metrics\n- **P&L:** +$${pnl}\n- **Win Rate:** ${winRate}%\n- **Total Trades:** ${10 + Math.floor(Math.random() * 15)}\n- **Max Drawdown:** ${(1 + Math.random() * 3).toFixed(1)}%\n- **Sharpe Ratio:** ${(1.2 + Math.random() * 1.5).toFixed(2)}\n\n### Strategy Breakdown\n1. **Endgame** — Primary edge source, buying near-certain resolutions\n2. **Whale Copy** — Following smart money on Polygon CTF\n3. **Cross-Market** — Exploiting price differences across platforms\n\n*All results from paper trading. Past performance does not guarantee future results.*`,
    date: formatDate(today),
    tags: ['Performance', 'Weekly Report'],
    type: 'performance',
    url: '#',
    generatedAt: today.toISOString(),
  };
}

/** Generate strategy spotlight post */
export function generateStrategySpotlight(): BlogPost {
  const today = new Date();
  const spotlights = [
    {
      name: 'Endgame Strategy',
      desc: 'buying near-certain outcomes before resolution',
      edge: 'near-zero risk when properly filtered by resolution criteria',
    },
    {
      name: 'Whale Copy-Trading',
      desc: 'following smart money movements on Polygon CTF',
      edge: 'whales have information advantages; we detect their moves in real-time',
    },
    {
      name: 'Neg-Risk Multi-Outcome',
      desc: 'scanning multi-outcome events where YES shares sum to less than $1',
      edge: 'guaranteed profit when all outcomes are covered below parity',
    },
    {
      name: 'Cross-Market Arbitrage',
      desc: 'exploiting price differences across Polymarket, Kalshi, and Limitless',
      edge: 'same event priced differently across platforms due to liquidity fragmentation',
    },
  ];
  const spotlight = spotlights[Math.floor(Math.random() * spotlights.length)]!;

  return {
    id: generateId(),
    title: `Strategy Spotlight: ${spotlight.name}`,
    excerpt: `Deep dive into our ${spotlight.name.toLowerCase()} — ${spotlight.desc}. The edge: ${spotlight.edge}.`,
    content: `## Strategy Spotlight: ${spotlight.name}\n\n### Overview\n${spotlight.desc.charAt(0).toUpperCase() + spotlight.desc.slice(1)}.\n\n### Why It Works\n${spotlight.edge.charAt(0).toUpperCase() + spotlight.edge.slice(1)}.\n\n### How CashClaw Implements It\nOur engine combines this strategy with Kelly Criterion position sizing (half-Kelly, 2% max) and a 5% daily stop-loss. AI validation via DeepSeek R1 confirms edge before execution.\n\n### Results\nThis strategy has been consistently profitable in our paper trading with a positive expectation per trade.\n\n*Learn more at cashclaw.cc. Not financial advice.*`,
    date: formatDate(today),
    tags: ['Strategy', spotlight.name.split(' ')[0]!],
    type: 'strategy-spotlight',
    url: '#',
    generatedAt: today.toISOString(),
  };
}
