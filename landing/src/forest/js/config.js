// ── CashClaw Configuration (seed layer) ──
// Static constants — importable by all modules

export const CHECKOUT = {
  STARTER: { url: 'https://nowpayments.io/payment?iid=4725459350&sid=1563487829', price: 49 },
  PRO:     { url: 'https://nowpayments.io/payment?iid=5493882802&sid=270466099',  price: 149 },
  ELITE:   { url: 'https://nowpayments.io/payment?iid=5264305182&sid=1338018334', price: 499 }
};

export const API_BASE = '/api';

export const TIER_PRICES = { STARTER: 49, PRO: 149, ELITE: 499 };

export const TIER_MAP = { STARTER: 'free', PRO: 'pro', ELITE: 'enterprise' };

export const DASHBOARD_URL = 'https://quant.cashclaw.cc/app';
