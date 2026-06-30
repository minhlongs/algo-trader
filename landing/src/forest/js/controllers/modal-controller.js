// ── CashClaw Activation Modal Controller (forest controller) ──
// DOM manipulation only — no business logic

import { postJSON } from '../utils/api.js';
import { formatTierName } from '../utils/format.js';
import { activateCoupon } from '../services/coupon-service.js';
import { DASHBOARD_URL, TIER_MAP } from '../config.js';

let activeTier = '';

/**
 * Show the activation modal for a given tier.
 */
export function showActivationModal(tier) {
  activeTier = tier;
  const overlay = document.getElementById('activation-modal');
  const tierEl = document.getElementById('modal-tier');
  if (tierEl) tierEl.textContent = formatTierName(tier);

  overlay.classList.add('active');
  document.getElementById('modal-form').style.display = 'block';
  document.getElementById('modal-done').style.display = 'none';
  document.getElementById('modal-error').textContent = '';

  setTimeout(() => {
    const emailInput = document.getElementById('modal-email');
    if (emailInput) emailInput.focus();
  }, 100);
}

/**
 * Close the activation modal.
 */
export function closeModal() {
  document.getElementById('activation-modal').classList.remove('active');
}

/**
 * Submit the activation form — register user, then activate coupon.
 */
export async function submitActivation(coupon) {
  const email = document.getElementById('modal-email').value.trim();
  const password = document.getElementById('modal-password').value;
  const errEl = document.getElementById('modal-error');
  errEl.textContent = '';

  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    errEl.textContent = 'Valid email required';
    return;
  }
  if (!password || password.length < 6) {
    errEl.textContent = 'Password must be at least 6 characters';
    return;
  }

  const btn = document.getElementById('modal-submit');
  btn.disabled = true;
  btn.textContent = 'Creating account...';

  const dashTier = TIER_MAP[activeTier] || 'free';

  const result = await postJSON('/api/auth/register', {
    email,
    password,
    tier: dashTier
  });

  if (!result.ok) {
    errEl.textContent = result.error || 'Registration failed. Try again or contact support.';
    btn.disabled = false;
    btn.textContent = 'Create Account & Activate';
    return;
  }

  // Success — show done state
  document.getElementById('modal-form').style.display = 'none';
  document.getElementById('modal-done').style.display = 'block';
  document.getElementById('modal-confirm-email').textContent = email;
  document.getElementById('modal-confirm-tier').textContent = formatTierName(activeTier);
  document.getElementById('modal-dashboard-link').href =
    result.data.dashboardUrl || DASHBOARD_URL;

  // Fire-and-forget coupon activation
  const couponCode = coupon ? coupon.code : '';
  activateCoupon(email, activeTier, couponCode);

  btn.disabled = false;
  btn.textContent = 'Create Account & Activate';
}

/**
 * Initialize modal event listeners.
 */
export function initModal(couponRef) {
  // Close on overlay click
  document.getElementById('activation-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Submit button
  document.getElementById('modal-submit').addEventListener('click', () => {
    submitActivation(couponRef());
  });

  // Close button
  const closeBtn = document.querySelector('.modal-close');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
}
