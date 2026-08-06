// ── CashClaw Main Entry Point (forest) ──
// Wires all controllers and services on DOMContentLoaded

import { CHECKOUT } from './config.js';
import { getCheckoutUrl } from './services/checkout-service.js';
import { fetchStats } from './services/stats-service.js';
import { showActivationModal, initModal } from './controllers/modal-controller.js';
import { initCoupon, showCouponError } from './controllers/coupon-controller.js';
import { updatePrices } from './controllers/price-display.js';
import { redeemCoupon } from './services/coupon-service.js';

// ── Shared state (module-scoped, not global) ──
let activeCoupon = null;

// ── Checkout button wiring ──
function wireCheckoutButtons() {
  const buttons = [
    { id: 'btn-free', tier: 'FREE' },
    { id: 'btn-starter', tier: 'STARTER' },
    { id: 'btn-pro', tier: 'PRO' },
    { id: 'btn-elite', tier: 'ELITE' }
  ];

  for (const { id, tier } of buttons) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.href = CHECKOUT[tier].url;

    btn.addEventListener("click", async (e) => {
      e.preventDefault();

      if (tier === "FREE") {
        if (activeCoupon && activeCoupon.freeAccess) {
          showActivationModal(tier);
          return;
        }
        const target = document.getElementById("get-started-free");
        if (target) target.scrollIntoView({ behavior: "smooth" });
        return;
      }

      if (activeCoupon && activeCoupon.freeAccess) {
        showActivationModal(tier);
        return;
      }

      if (activeCoupon && activeCoupon.code) {
        const result = await redeemCoupon(tier, activeCoupon.code);
        if (!result.ok) {
          showCouponError(result.error || "Redemption failed");
          return;
        }
        if (result.data && result.data.checkoutUrl) {
          window.location.href = result.data.checkoutUrl;
        }
        return;
      }

      const url = getCheckoutUrl(tier, null);
      if (url) window.location.href = url;
    });
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
