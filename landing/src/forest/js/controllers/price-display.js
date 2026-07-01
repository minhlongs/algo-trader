// ── CashClaw Price Display Controller (forest controller) ──
// DOM manipulation for pricing cards — no business logic

import { formatPrice } from '../utils/format.js';
import { calculatePrices } from '../services/coupon-service.js';
import { TIER_PRICES } from '../config.js';

const PRICE_IDS = ['price-starter', 'price-pro', 'price-elite'];

/**
 * Update the pricing display based on current coupon.
 */
export function updatePrices(coupon) {
  if (!coupon) {
    // Reset to original prices
    for (const [i, tier] of Object.keys(TIER_PRICES).entries()) {
      const el = document.getElementById(PRICE_IDS[i]);
      if (el) {
        el.innerHTML = `$${TIER_PRICES[tier]}<span>/mo</span>`;
      }
    }
    return;
  }

  const prices = calculatePrices(coupon);
  const tiers = Object.keys(TIER_PRICES);

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const el = document.getElementById(PRICE_IDS[i]);
    if (!el) continue;

    const p = prices[tier];
    if (p.isFree) {
      el.innerHTML = '<span style="color:var(--color-emerald)">FREE</span>';
    } else {
      let html = `${formatPrice(p.finalPrice)}<span>/mo</span>`;
      if (p.finalPrice < p.originalPrice) {
        html += ` <span style="text-decoration:line-through;color:var(--text-muted);font-size:var(--text-xs)">$${p.originalPrice}</span>`;
      }
      el.innerHTML = html;
    }
  }
}
