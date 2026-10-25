/**
 * Invoice Tier Label Resolver
 *
 * The webhook invoice needs an outward-facing plan name for a settled amount. It
 * previously derived that name from raw amount literals (`>= 499 ? 'Elite' :
 * '>= 149 ? 'Pro' : 'Starter'`) — a third tier vocabulary that matched neither the
 * platform price book nor the license tiers, and that silently mislabelled a paid
 * marketplace subscription as a platform plan.
 *
 * This resolves the label from a price book instead. When no book contains the exact
 * amount, it returns null rather than inventing a name: an invoice that shows a plan
 * the customer never bought is a billing dispute in the making, and a wrong label on
 * the money path is worse than a blank one.
 */

import { PRICING_TIERS } from './pricing-tiers';
import { SIGNALS_PRICE_BOOK } from './signals-price-book';

/** Channel that produced the payment, from the `order_id` prefix. */
export type InvoiceChannel = 'signals' | 'marketplace' | 'platform';

const MARKETPLACE_LABEL = 'Marketplace Strategy Subscription';

/**
 * Outward-facing plan name for a settled USD amount, or null when the amount matches
 * no price book.
 *
 * The channel narrows the search: `signals` resolves only against the signals price
 * book, `platform` only against the platform price book, so a shared amount (99, 299)
 * can never be cross-labelled. The marketplace channel sells creator-priced listings
 * rather than price-book plans, so it carries its own label instead of borrowing a
 * tier name.
 */
export function resolveInvoiceTierLabel(
  channel: InvoiceChannel,
  paidAmountUsd: number,
): string | null {
  if (channel === 'marketplace') return MARKETPLACE_LABEL;

  const book =
    channel === 'signals'
      ? SIGNALS_PRICE_BOOK
      : (PRICING_TIERS as Record<string, { name?: string; price?: number }>);

  const target = channel === 'signals' ? 'priceUsd' : 'price';
  for (const entry of Object.values(book)) {
    const record = entry as unknown as Record<string, number | string | undefined>;
    if (record[target] === paidAmountUsd && typeof record.name === 'string') {
      return record.name;
    }
  }

  return null;
}

/** Derive the invoice channel from an order_id prefix. */
export function resolveInvoiceChannel(orderId: string | undefined): InvoiceChannel {
  if (orderId?.startsWith('sig_')) return 'signals';
  if (orderId?.startsWith('mp_')) return 'marketplace';
  return 'platform';
}
