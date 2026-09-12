/**
 * Email templates for the trial-to-paid drip campaign sequence.
 */
import { type EmailTemplate } from './trial-drip-types';

export const DRIP_EMAIL_TEMPLATES: Record<number, EmailTemplate> = {
  1: (sub) => ({
    subject: 'Welcome to AlgoTrader — Your 7-Day Trial Starts Now',
    body: `Hi there,\n\nWelcome to AlgoTrader! Your ${sub.tier} trial is active until ${new Date(sub.trialEndsAt).toLocaleDateString()}.\n\nHere's how to get started:\n1. Explore the dashboard at https://cashclaw.cc/dashboard\n2. Review today's signals in the Telegram bot\n3. Set your risk parameters in Settings\n\nNeed help? Join our Discord community or reply to this email.\n\n— The AlgoTrader Team`,
    html: `<h2>Welcome to AlgoTrader</h2><p>Your <strong>${sub.tier}</strong> trial is active until <strong>${new Date(sub.trialEndsAt).toLocaleDateString()}</strong>.</p><h3>Getting Started</h3><ol><li>Explore the <a href="https://cashclaw.cc/dashboard">dashboard</a></li><li>Review today's signals in the Telegram bot</li><li>Set your risk parameters in Settings</li></ol><p>Need help? Join our community or reply to this email.</p><p>— The AlgoTrader Team</p>`,
  }),
  3: (_sub) => ({
    subject: 'Your AI Edge: How Kelly Sizing Works',
    body: `Hi there,\n\nHalfway through your first week. Here's what makes AlgoTrader different:\n\n1. AI-Powered Scanning — OpenClaw scans every Polymarket market\n2. Kelly Criterion — Optimal position sizing, max 2% per trade\n3. Daily Stop-Loss — Hard-coded 5% daily drawdown limit\n\nLog in to see today's top opportunities with edge scores.\n\n— The AlgoTrader Team`,
    html: `<h2>Your AI Edge: Kelly Sizing</h2><p>Halfway through your first week. Here's what makes AlgoTrader different:</p><ul><li><strong>AI Scanning</strong> — Every Polymarket market scanned</li><li><strong>Kelly Criterion</strong> — Optimal position sizing</li><li><strong>Stop-Loss</strong> — 5% daily drawdown limit</li></ul><p><a href="https://cashclaw.cc/dashboard">View today's signals</a></p>`,
  }),
  5: (_sub) => ({
    subject: 'Real Results: Our Paper Trading Track Record',
    body: `Hi there,\n\nOur paper trading engine has been running since launch. Here's what the numbers look like:\n\n- Sharpe ratio: 1.8+\n- Win rate: 62%\n- Max drawdown: 8%\n- Total P&L: +$2,251\n\nEvery signal we sell, we trade ourselves. Full transparency.\n\nSee the live P&L: https://cashclaw.cc/trading-performance\n\n— The AlgoTrader Team`,
    html: `<h2>Real Results</h2><p>Our paper trading track record:</p><ul><li>Sharpe ratio: <strong>1.8+</strong></li><li>Win rate: <strong>62%</strong></li><li>Total P&amp;L: <strong>+$2,251</strong></li></ul><p><a href="https://cashclaw.cc/trading-performance">View live P&amp;L</a></p>`,
  }),
  7: (sub) => ({
    subject: "Your Trial Ends Tomorrow — Don't Lose Access",
    body: `Hi there,\n\nYour ${sub.tier} trial ends tomorrow. To keep your access:\n\n1. Go to https://cashclaw.cc/pricing\n2. Choose your plan (Pro from $99/mo)\n3. Complete payment with USDT\n\nUpgrade now and keep your signal history, saved settings, and API access.\n\n— The AlgoTrader Team`,
    html: `<h2>Trial Ending Tomorrow</h2><p>Your <strong>${sub.tier}</strong> trial ends soon. <a href="https://cashclaw.cc/pricing">Upgrade now</a> to keep access.</p><p>Plans start from $99/mo. Pay with USDT.</p>`,
  }),
  10: (_sub) => ({
    subject: 'We Miss You — Special Offer Inside',
    body: `Hi there,\n\nYour trial expired, but we'd love to have you back. As a returning trial user, here's a special offer:\n\n- 20% off your first month with code TRIAL20\n- Priority onboarding support\n- Extended 14-day refund window\n\nReactivate now: https://cashclaw.cc/pricing?coupon=TRIAL20\n\n— The AlgoTrader Team`,
    html: `<h2>Come Back to AlgoTrader</h2><p>Your trial expired, but we'd love to have you back.</p><p>Use code <strong>TRIAL20</strong> for 20% off your first month.</p><p><a href="https://cashclaw.cc/pricing?coupon=TRIAL20">Reactivate now</a></p>`,
  }),
};
