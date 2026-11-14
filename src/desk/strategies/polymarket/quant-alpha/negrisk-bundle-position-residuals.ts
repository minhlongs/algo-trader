/**
 * Residual positions left behind by a NegRisk bundle.
 *
 * A converted basket leaves nothing for TP/SL to manage, so the residual of
 * every leg is `fill.quantity - consumedBaskets`, with entry fees prorated by
 * the same ratio. Dust residuals are dropped rather than tracked as positions
 * that can never be closed at a positive price.
 */

import type { OpenPosition } from '../base-polymarket-strategy';
import type { BundleFill } from './negrisk-bundle-arbitrage-state';

/** Residual below this is dust: it cannot pay its own exit cost. */
const RESIDUAL_DUST_EPSILON = 1e-9;

export function residualPositions(fills: readonly BundleFill[], consumedBaskets: number): OpenPosition[] {
  return fills.flatMap((fill) => {
    const quantity = fill.quantity - consumedBaskets;
    if (!(quantity > RESIDUAL_DUST_EPSILON)) return [];
    const grossFees = parseFloat(fill.fees ?? '0') || 0;
    return [{
      tokenId: fill.tokenId,
      conditionId: fill.conditionId,
      side: 'yes',
      entryPrice: fill.price,
      sizeUsdc: quantity * fill.price,
      tokenQuantity: quantity,
      entryFeesUsdc: quantity === fill.quantity ? grossFees : grossFees * (quantity / fill.quantity),
      orderId: fill.orderId,
      openedAt: fill.atMs,
    }];
  });
}