// ── CashClaw Configuration (seed layer) ──
// Static constants — importable by all modules

export const CHECKOUT = {
  FREE: { url: '/#get-started-free', price: 0 },
  STARTER: { url: 'https://nowpayments.io/payment?iid=4725459350&sid=1563487829', price: 19 },
  PRO: { url: 'https://nowpayments.io/payment?iid=5493882802&sid=270466099', price: 99 },
  ELITE: { url: 'https://nowpayments.io/payment?iid=5264305182&sid=1338018334', price: 299 }
};

export const API_BASE = '/api';

export const TIER_PRICES = { FREE: 0, STARTER: 19, PRO: 99, ELITE: 299 };

export const TIER_MAP = { FREE: 'free', STARTER: 'starter', PRO: 'pro', ELITE: 'enterprise' };

export const DASHBOARD_URL = 'https://quant.cashclaw.cc/app';
