/**
 * Monetization End-to-End — both money channels into one entitlement.
 *
 * Price books (blocks 1 and 2): which tier an amount maps to, per channel.
 *
 * The mocked boundary lives in `monetization-e2e.fixtures.ts`: the database pool
 * (`pg`) and the outbound HTTP provider call (`fetch`). The tier resolution and the
 * payout split are the behaviour under test, so their real modules run unmodified.
 *
 * These two blocks are pure-function tests: they assert the price books only and
 * need none of the fixtures, so nothing is imported from that module here.
 */

process.env.AUDIT_HMAC_KEY_v1 = 'a'.repeat(64);

import { describe, it, expect } from 'vitest';
import {
  SIGNALS_PRICE_BOOK,
  resolveSignalsTierForAmount,
  SignalsPriceNotFoundError,
  listSignalsPrices,
} from '../signals-price-book';
import { resolveInvoiceChannel, resolveInvoiceTierLabel } from '../invoice-tier-label';
import { PRICING_TIERS } from '../pricing-tiers';

describe('signals price book is the only source of a paid tier', () => {
  it('declares each signals plan exactly once with its delivery tier', () => {
    expect(listSignalsPrices()).toEqual([29, 99, 299]);
    expect(SIGNALS_PRICE_BOOK.SIGNALS_BASIC.tier).toBe('BASIC');
    expect(SIGNALS_PRICE_BOOK.SIGNALS_PRO.tier).toBe('PRO');
    expect(SIGNALS_PRICE_BOOK.SIGNALS_ENTERPRISE.tier).toBe('ENTERPRISE');
  });

  it('does not collapse the paid Basic buy into FREE', () => {
    // FREE is the unsubscribed state: a paid Basic customer must stay distinguishable
    // from one who never bought, so BASIC survives as a real delivery tier.
    const tiers = Object.values(SIGNALS_PRICE_BOOK).map((e) => e.tier);
    expect(tiers).toContain('BASIC');
    expect(tiers).not.toContain('FREE');
  });

  it('resolves the tier for a declared price and throws for anything else', () => {
    expect(resolveSignalsTierForAmount(29).tier).toBe('BASIC');
    expect(resolveSignalsTierForAmount(99).tier).toBe('PRO');
    expect(resolveSignalsTierForAmount(299).tier).toBe('ENTERPRISE');

    for (const unmapped of [0, 7, 49, 999, 299.5, Number.NaN]) {
      expect(() => resolveSignalsTierForAmount(unmapped)).toThrow(SignalsPriceNotFoundError);
    }
  });

  it('keeps the signals book separate from the platform book despite shared numbers', () => {
    // 99 and 299 exist in both books. A shared amount→tier map would grant a signals
    // buyer a platform tier (or vice versa), so the books must stay distinct.
    expect(PRICING_TIERS.PRO.price).toBe(SIGNALS_PRICE_BOOK.SIGNALS_PRO.priceUsd);
    expect(PRICING_TIERS.ENTERPRISE.price).toBe(SIGNALS_PRICE_BOOK.SIGNALS_ENTERPRISE.priceUsd);
    expect(resolveSignalsTierForAmount(99).tier).toBe('PRO');
    // The platform-only $49 amount must throw in the signals book, not land on a tier.
    expect(() => resolveSignalsTierForAmount(PRICING_TIERS.STARTER.price)).toThrow(
      SignalsPriceNotFoundError,
    );
  });
});

describe('invoice tier labels come from a price book, not amount brackets', () => {
  it('labels each channel from its own book', () => {
    expect(resolveInvoiceChannel('sig_sub-1_1700')).toBe('signals');
    expect(resolveInvoiceChannel('mp_listing-1_tenant_1700')).toBe('marketplace');
    expect(resolveInvoiceChannel('algotrade_cust_1700')).toBe('platform');

    expect(resolveInvoiceTierLabel('signals', 29)).toBe('Signals Basic');
    expect(resolveInvoiceTierLabel('platform', PRICING_TIERS.PRO.price)).toBe('Pro');
    expect(resolveInvoiceTierLabel('marketplace', 4900)).toBe('Marketplace Strategy Subscription');
  });

  it('returns null rather than inventing a plan name for an unlisted amount', () => {
    // A wrong plan name on the money path is a billing dispute; no label beats a wrong one.
    expect(resolveInvoiceTierLabel('platform', 1234)).toBeNull();
    expect(resolveInvoiceTierLabel('signals', 1234)).toBeNull();
  });
});
