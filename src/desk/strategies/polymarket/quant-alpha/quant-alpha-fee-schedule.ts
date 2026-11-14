/**
 * Fee-schedule resolution for the quant-alpha strategies.
 *
 * A fill's cost is a property of the market, so every strategy asks the venue
 * per token. Three states, and they are not the same answer:
 *
 *   - no resolver configured -> book the conservative paper schedule
 *   - resolver returns null  -> the exchange charges nothing (exempt market)
 *   - resolver throws        -> the cost is unknown, so the order is refused
 *
 * Returning `null` from this helper means "unknown"; callers must skip the
 * order rather than assume it is free.
 */

import { logger } from '../../../core/logger';
import {
  EXEMPT_FEE_SCHEDULE,
  type PolymarketFeeSchedule,
} from '../../../polymarket/polymarket-fee-calculator';
import { DEFAULT_PAPER_FEE_SCHEDULE } from '../../../polymarket/paper-fill-sweep';
import type { FeeScheduleResolver } from '../../../polymarket/fee-schedule-resolver';

export async function resolveStrategyFeeSchedule(
  resolver: FeeScheduleResolver | undefined,
  tokenId: string,
  strategyName: string,
): Promise<PolymarketFeeSchedule | null> {
  if (!resolver) return DEFAULT_PAPER_FEE_SCHEDULE;
  try {
    const resolved = await resolver.resolve(tokenId);
    return resolved ?? EXEMPT_FEE_SCHEDULE;
  } catch (err) {
    logger.warn('Fee schedule unavailable, refusing order', strategyName, {
      tokenId,
      err: String(err),
    });
    return null;
  }
}
