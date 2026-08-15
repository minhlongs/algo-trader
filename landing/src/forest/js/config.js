// ── CashClaw Configuration (seed layer) ──
// Static constants — importable by all modules

export const CHECKOUT = {
  FREE: { url: '/#get-started-free', price: 0 },
  STARTER: { url: 'https://nowpayments.io/payment?iid=4725459350&sid=1563487829', price: 99 },
  PRO: { url: 'https://nowpayments.io/payment?iid=5493882802&sid=270466099', price: 299 },
  ELITE: { url: 'https://nowpayments.io/payment?iid=5264305182&sid=1338018334', price: 999 }
};

export const API_BASE = '/api';

export const TIER_PRICES = { FREE: 0, STARTER: 99, PRO: 299, ELITE: 999 };

export const TIER_MAP = { FREE: 'free', STARTER: 'pro', PRO: 'enterprise', ELITE: 'master' };

export const DASHBOARD_URL = 'https://quant.cashclaw.cc/app';
