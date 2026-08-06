// ── CashClaw Coupon Controller (forest controller) ──
// DOM manipulation for coupon input — no business logic

import { validateCoupon } from '../services/coupon-service.js';

/**
 * Initialize coupon input UI — wire up input, button, and message display.
 * @param {() => object|null} getCoupon — returns the current coupon state
 * @param {(c: object|null) => void} setCoupon — sets the coupon state
 * @param {() => void} onCouponChanged — callback when coupon changes
 */
export function initCoupon(getCoupon, setCoupon, onCouponChanged) {
  const input = document.getElementById('coupon-input');
  const btn = document.getElementById('coupon-apply-btn');
  const msg = document.getElementById('coupon-message');
  if (!input || !btn || !msg) return;

  async function applyCoupon(code) {
    const c = code.toUpperCase().trim();
    btn.disabled = true;
    btn.textContent = '...';

    const result = await validateCoupon(c);

    if (result.ok && result.data.valid) {
      const coupon = {
        code: c,
        discountPercent: result.data.discountPercent || 0,
        urls: result.data.urls,
        freeAccess: result.data.freeAccess || false
      };
      setCoupon(coupon);

      const messageHtml = coupon.freeAccess
        ? '<span style="color:var(--color-emerald)">✓ Code applied — free access unlocked!</span>'
        : `<span style="color:var(--color-emerald)">✓ ${coupon.discountPercent}% off applied</span>`;
      msg.innerHTML = messageHtml;
      onCouponChanged();
    } else {
      setCoupon(null);
      const reason = result.data ? (result.data.reason || 'Invalid code') : result.error;
      msg.innerHTML = `<span style="color:var(--color-rose)">✗ ${reason}</span>`;
      onCouponChanged();
    }

    btn.disabled = false;
    btn.textContent = 'Apply';
  }

  btn.addEventListener('click', () => {
    const code = input.value.trim().toUpperCase();
    if (!code) {
      msg.innerHTML = '<span style="color:var(--color-rose)">Enter a code</span>';
      return;
    }
    applyCoupon(code);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const code = input.value.trim().toUpperCase();
      if (code) applyCoupon(code);
    }
  });

  input.addEventListener('input', () => {
    if (getCoupon()) {
      setCoupon(null);
      onCouponChanged();
      msg.textContent = '';
    }
  });
}

/** Show an error in the coupon message area (called from main.js on redeem failure). */
export function showCouponError(message) {
  const el = document.getElementById('coupon-message');
  if (el) el.innerHTML = `<span style="color:var(--color-rose)">✗ ${message}</span>`;
}
