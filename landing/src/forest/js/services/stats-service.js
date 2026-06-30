// ── CashClaw Stats Service (forest service) ──
// Live stats fetch — pure business logic, no DOM

import { API_BASE } from '../config.js';
import { getJSON } from '../utils/api.js';

/**
 * Fetch public platform stats.
 * Returns { ok, data: { volume, roi, accuracy, signals } }
 */
export async function fetchStats() {
  return getJSON(`${API_BASE}/public/stats`);
}
