/**
 * Signal Subscription Routes - Checkout & Billing Handlers
 */

import { Request, Response } from 'express';
import { resolveSubscriberId } from '../../middleware/signal-tier-resolver';
import { NOWPAYMENTS_TIERS } from '../../billing/nowpayments-service';
import type { TierKey } from '../../../desk/signal/signal-types';
import { signalSubscriberRepo } from '../../signal/signal-subscriber-repository-d1';
import { logger } from '../../../shared/utils/logger';
import { checkoutBodySchema } from './signal-subscription-types';

export function handleBillingPlans(_req: Request, res: Response): void {
  const plans = Object.entries(NOWPAYMENTS_TIERS)
    .filter(([key]) => key.startsWith('SIGNALS_'))
    .map(([key, cfg]) => ({
      tier: key,
      name: cfg.name,
      priceUsd: cfg.price,
      currency: cfg.currency,
    }));
  res.json({ data: plans });
}

export async function handleBillingCheckout(req: Request, res: Response): Promise<void> {
  try {
    const identity = resolveSubscriberId(req);
    if (!identity) {
      res.status(401).json({ error: 'Valid API key required' });
      return;
    }

    const parsed = checkoutBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid tier' });
      return;
    }

    const { tier } = parsed.data;
    const tierConfig = NOWPAYMENTS_TIERS[tier];
    if (!tierConfig) {
      res.status(400).json({ error: `No billing config for tier: ${tier}` });
      return;
    }

    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: 'Payment provider not configured' });
      return;
    }

    const orderId = `sig_${identity.subscriberId}_${Date.now()}`;
    const successUrl = `${process.env.CHECKOUT_SUCCESS_URL || 'https://cashclaw.cc/dashboard'}?tier=${tier}`;
    const cancelUrl = process.env.CHECKOUT_CANCEL_URL || 'https://cashclaw.cc/pricing';

    const invoiceRes = await fetch('https://api.nowpayments.io/v1/invoice', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        price_amount: tierConfig.price,
        price_currency: 'usd',
        pay_currency: 'usdttrc20',
        order_id: orderId,
        order_description: `AlgoTrader ${tierConfig.name} Signal Subscription`,
        success_url: successUrl,
        cancel_url: cancelUrl,
      }),
    });

    if (!invoiceRes.ok) {
      const body = await invoiceRes.text();
      logger.error('[SignalsCheckout] Invoice creation failed', { status: invoiceRes.status, body, tier });
      res.status(502).json({ error: 'Payment provider unavailable' });
      return;
    }

    const invoice = await invoiceRes.json() as { id: string; invoice_url: string };
    logger.info('[SignalsCheckout] Invoice created', { invoiceId: invoice.id, tier, orderId });
    res.json({ invoiceId: invoice.id, checkoutUrl: invoice.invoice_url });
  } catch (error) {
    logger.error('[SignalsCheckout] Error', { error });
    res.status(502).json({ error: 'Payment provider unavailable' });
  }
}

export async function handleBillingStats(_req: Request, res: Response): Promise<void> {
  try {
    const subs = await signalSubscriberRepo.getActiveSubscriptions();
    // Group by tier — partial stats until metering layer provides real data
    const breakdown: Record<string, number> = {};
    for (const s of subs) {
      const t: TierKey = s.tier ?? 'FREE';
      breakdown[t] = (breakdown[t] ?? 0) + 1;
    }
    res.json({ data: breakdown });
  } catch (err) {
    logger.error('[SignalSub] Billing stats error', { err });
    res.status(500).json({ error: 'Failed to fetch billing stats' });
  }
}
