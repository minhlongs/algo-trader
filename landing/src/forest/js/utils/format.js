// ── CashClaw Formatting Utilities (forest utils) ──

/**
 * Format a dollar amount. $49, $149.50, etc.
 */
export function formatPrice(dollars) {
  return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/**
 * Format a tier name for display: "STARTER" → "Starter"
 */
export function formatTierName(tier) {
  return tier.charAt(0) + tier.slice(1).toLowerCase();
}
