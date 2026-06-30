// ── CashClaw Main Entry Point (forest) ──
// Wires all controllers and services on DOMContentLoaded

import { CHECKOUT } from './config.js';
import { getCheckoutUrl } from './services/checkout-service.js';
import { fetchStats } from './services/stats-service.js';
import { showActivationModal, initModal } from './controllers/modal-controller.js';
import { initCoupon } from './controllers/coupon-controller.js';
import { updatePrices } from './controllers/price-display.js';

// ── Shared state (module-scoped, not global) ──
let activeCoupon = null;

// ── Checkout button wiring ──
function wireCheckoutButtons() {
  const buttons = [
    { id: 'btn-starter', tier: 'STARTER' },
    { id: 'btn-pro',     tier: 'PRO' },
    { id: 'btn-elite',   tier: 'ELITE' }
  ];

  for (const { id, tier } of buttons) {
    const btn = document.getElementById(id);
    if (!btn) continue;

    btn.addEventListener('click', (e) => {
      e.preventDefault();

      if (activeCoupon && activeCoupon.freeAccess) {
        showActivationModal(tier);
        return;
      }

      const url = getCheckoutUrl(tier, activeCoupon);
      if (url) {
        window.location.href = url;
      }
    });

    // Set initial href for non-JS fallback
    btn.href = CHECKOUT[tier].url;
  }
}

// ── Live stats ──
async function loadStats() {
  const result = await fetchStats();
  if (!result.ok || !result.data) return;

  const { volume, roi, accuracy, signals } = result.data;
  const cells = document.querySelectorAll('.stat-value');
  if (cells[0] && volume) cells[0].textContent = volume;
  if (cells[1] && roi) cells[1].textContent = roi;
  if (cells[2] && accuracy) cells[2].textContent = accuracy;
  if (cells[3] && signals) cells[3].textContent = signals;
}

// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', () => {
  wireCheckoutButtons();

  initCoupon(
    () => activeCoupon,
    (c) => { activeCoupon = c; },
    () => updatePrices(activeCoupon)
  );

  initModal(() => activeCoupon);

  loadStats();
});
