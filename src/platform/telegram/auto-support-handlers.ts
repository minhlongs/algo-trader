/**
 * Telegram Auto-Support Handlers
 * a16z Solo Company Layer 5: System SUPPORTS customers autonomously
 *
 * Commands: /faq, /support, /pricing
 * Catch-all: fuzzy-match unknown messages to FAQ entries
 */

import type { Context } from 'grammy';

/** FAQ database — keyword-matched for auto-responses */
const FAQ_ENTRIES = [
  {
    keywords: ['safe', 'wallet', 'secure', 'security', 'key', 'private'],
    q: 'Is my wallet safe with auto-execution?',
    a: 'Your private key is encrypted at rest (AES-256-GCM). The engine only has trade access, never withdrawal. Hard-coded 2% max position, 5% daily stop-loss enforced.',
  },
  {
    keywords: ['edge', 'how', 'work', 'signal', 'algorithm'],
    q: 'What is the edge based on?',
    a: 'Our AI estimates resolution probability independently of market price. Edge = our estimate minus market-implied probability. Only signals with edge > 5% are published.',
  },
  {
    keywords: ['cancel', 'refund', 'stop', 'unsubscribe'],
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel anytime. You keep access until the end of your billing period. No lock-in.',
  },
  {
    keywords: ['market', 'which', 'platform', 'polymarket', 'kalshi', 'cover'],
    q: 'What markets are covered?',
    a: 'Polymarket, Kalshi, Limitless, PredictIt, and Smarkets — all active binary markets. We filter for resolution within 7-30 days and minimum liquidity.',
  },
  {
    keywords: ['pay', 'usdt', 'crypto', 'payment', 'billing', 'price'],
    q: 'How do I pay?',
    a: 'We accept USDT (TRC20) via NOWPayments. Pay once, get instant access. No credit card required.',
  },
  {
    keywords: ['api', 'key', 'license', 'access', 'connect', 'integrate'],
    q: 'How do I connect my API key?',
    a: 'After signup, use /link <your-license-key> here in Telegram. Include X-License-Key header in API requests. Full docs at cashclaw.cc.',
  },
  {
    keywords: ['paper', 'test', 'demo', 'trial', 'free'],
    q: 'Is there a free trial?',
    a: 'Yes! Use coupon code at cashclaw.cc for free access. Paper trading mode lets you validate signals risk-free before committing real capital.',
  },
  {
    keywords: ['strategy', 'strategies', 'endgame', 'whale', 'arb'],
    q: 'What strategies does CashClaw use?',
    a: '52+ strategies across 5 platforms. Top performers: Endgame (near-certain resolution), Whale Copy-Trading, Cross-Market Arbitrage, Neg-Risk Multi-Outcome, BTC 15-min Momentum.',
  },
];

// -- /faq -----------------------------------------------------------------

export async function handleFaq(ctx: Context): Promise<void> {
  const faqList = FAQ_ENTRIES.map((f, i) => `*${i + 1}.* ${f.q}`).join('\n');
  const msg = `*Frequently Asked Questions*\n\n${faqList}\n\nType /faq <number> for the answer, or just ask your question and I'll find the best match.`;
  await ctx.reply(msg, { parse_mode: 'Markdown' });
}

// -- /faq <number> --------------------------------------------------------

export async function handleFaqDetail(ctx: Context): Promise<void> {
  const text = (ctx.message as { text?: string })?.text || '';
  const num = parseInt(text.replace(/^\/faq\s*/, ''), 10);

  if (isNaN(num) || num < 1 || num > FAQ_ENTRIES.length) {
    return handleFaq(ctx);
  }

  const entry = FAQ_ENTRIES[num - 1]!;
  await ctx.reply(`*Q: ${entry.q}*\n\n${entry.a}`, { parse_mode: 'Markdown' });
}

// -- /support -------------------------------------------------------------

export async function handleSupport(ctx: Context): Promise<void> {
  const msg = `*CashClaw Support*\n\nI can help with common questions automatically.\n\n*Try:*\n/faq — Browse all FAQs\n/pricing — View current plans\n/status — Check your account\n/limits — View API limits\n\nOr just type your question and I'll try to match it to a FAQ.\n\n*Human support:* Email support@cashclaw.cc (24h response for Pro/Elite).`;
  await ctx.reply(msg, { parse_mode: 'Markdown' });
}

// -- /pricing -------------------------------------------------------------

export async function handlePricing(ctx: Context): Promise<void> {
  const msg = `*CashClaw Pricing*\n\n*Pro — $99/mo*\nDaily signal digest, AI edge scores, Kelly sizing recommendations\n\n*Enterprise — $299/mo* (Most Popular)\nReal-time signals, REST API, auto-execution, priority support\n\n*Master — $999/mo*\nCustom market focus, personal dashboard, direct founder support\n\nPay with USDT. Cancel anytime.\n\nSign up: cashclaw.cc/#pricing`;
  await ctx.reply(msg, { parse_mode: 'Markdown' });
}

// -- Catch-all: fuzzy FAQ match -------------------------------------------

/** Match user message to FAQ entries by keyword overlap */
export function matchFaq(text: string): typeof FAQ_ENTRIES[number] | null {
  const words = text.toLowerCase().split(/\s+/);
  let bestMatch: typeof FAQ_ENTRIES[number] | null = null;
  let bestScore = 0;

  for (const entry of FAQ_ENTRIES) {
    const score = entry.keywords.reduce(
      (sum, kw) => sum + (words.some(w => w === kw || (w.length >= 4 && w.startsWith(kw)) || (kw.length >= 4 && kw.startsWith(w))) ? 1 : 0),
      0
    );
    if (score > bestScore && score >= 1) {
      bestScore = score;
      bestMatch = entry;
    }
  }
  return bestMatch;
}

/** Handle unknown messages with FAQ auto-matching */
export async function handleUnknownMessage(ctx: Context): Promise<void> {
  const text = (ctx.message as { text?: string })?.text || '';
  if (!text || text.startsWith('/')) return; // skip commands

  const match = matchFaq(text);
  if (match) {
    await ctx.reply(
      `I think you're asking about:\n\n*Q: ${match.q}*\n\n${match.a}\n\n_Type /faq for all questions or /support for more help._`,
      { parse_mode: 'Markdown' }
    );
  } else {
    await ctx.reply(
      'I couldn\'t match your question to a FAQ. Try:\n/faq — Browse all FAQs\n/support — Get help\n/pricing — View plans\n\nOr email support@cashclaw.cc'
    );
  }
}
