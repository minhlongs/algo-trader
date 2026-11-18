/**
 * POLY-G5 Public Beta — Pending-order cash/exposure/share reservations.
 *
 * Resting (`PENDING`) limit orders reserve cash, portfolio exposure, and sellable
 * shares so a tenant cannot stack unbounded unbacked orders (#C1b).
 */

import { MICRO_PER_USD, type PolyBetaD1Database } from './poly-beta-types';

export interface PendingReservations {
  buyNotionalMicro: number;
  buyFeeMicro: number;
  sellSharesMicro: number;
}

export function computePaperFeeMicro(notionalMicro: number, price: number): number {
  return Math.max(1_000, Math.round(notionalMicro * 0.02 * price * (1 - price)));
}

export async function loadPendingOrderReservations(
  db: PolyBetaD1Database,
  tenantId: string,
  tokenId: string,
): Promise<PendingReservations> {
  const res = await db
    .prepare(
      `SELECT token_id, side, price_micro, size_shares_micro
       FROM beta_orders WHERE tenant_id = ? AND status = 'PENDING'`,
    )
    .bind(tenantId)
    .all<{ token_id: string; side: 'BUY' | 'SELL'; price_micro: number; size_shares_micro: number }>();
  let buyNotionalMicro = 0;
  let buyFeeMicro = 0;
  let sellSharesMicro = 0;
  for (const row of res.results ?? []) {
    if (row.side === 'BUY') {
      const notional = Math.round((row.size_shares_micro / MICRO_PER_USD) * row.price_micro);
      buyNotionalMicro += notional;
      buyFeeMicro += computePaperFeeMicro(notional, row.price_micro / MICRO_PER_USD);
    } else if (row.token_id === tokenId) {
      sellSharesMicro += row.size_shares_micro;
    }
  }
  return { buyNotionalMicro, buyFeeMicro, sellSharesMicro };
}
