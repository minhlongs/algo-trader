/**
 * NOWPayments Invoice API Routes (Express)
 * Dynamic invoice creation for license checkout.
 *
 * POST /api/v1/nowpayments/invoice
 *   Body: { tier: "PRO" | "ENTERPRISE" | "MASTER" }
 *   Returns: { invoiceId, checkoutUrl }
 *   Errors: 400 (invalid tier), 502 (NOWPayments unavailable)
 *
 * This replaces the pre-created invoice URL approach with dynamic API
 * calls, giving us proper order_id tracking through the IPN webhook.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { NOWPAYMENTS_TIERS } from '../../billing/nowpayments-service';
import { logger } from '../../../shared/utils/logger';

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY || '';
const NOWPAYMENTS_API_BASE = 'https://api.nowpayments.io/v1';

const invoiceSchema = z.object({
  tier: z.enum(['PRO', 'ENTERPRISE', 'MASTER', 'SIGNALS_BASIC', 'SIGNALS_PRO', 'SIGNALS_ENTERPRISE']),
});

export const nowpaymentsApiRouter: Router = Router();

/**
 * POST /invoice
 * Create a dynamic NOWPayments invoice for the given tier.
 * The pricing-page CTA calls this to generate a checkout URL.
 */
nowpaymentsApiRouter.post('/invoice', async (req: Request, res: Response) => {
  try {
    // Validate input
    const parseResult = invoiceSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Invalid request',
        details: parseResult.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }

    const { tier } = parseResult.data;
    const tierConfig = NOWPAYMENTS_TIERS[tier];
    if (!tierConfig) {
      res.status(400).json({ error: `No configuration found for tier: ${tier}` });
      return;
    }

    if (!NOWPAYMENTS_API_KEY) {
      res.status(500).json({ error: 'NOWPayments API key not configured' });
      return;
    }

    const successUrl = process.env.CHECKOUT_SUCCESS_URL || 'https://cashclaw.cc/dashboard';
    const cancelUrl = process.env.CHECKOUT_CANCEL_URL || 'https://cashclaw.cc/pricing';
    const orderId = `license_${tier}_${Date.now()}`;

    const invoiceRes = await fetch(`${NOWPAYMENTS_API_BASE}/invoice`, {
      method: 'POST',
      headers: {
        'x-api-key': NOWPAYMENTS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        price_amount: tierConfig.price,
        price_currency: 'usd',
        pay_currency: 'usdttrc20',
        order_id: orderId,
        order_description: `AlgoTrader ${tierConfig.name} License`,
        success_url: successUrl,
        cancel_url: cancelUrl,
      }),
    });

    if (!invoiceRes.ok) {
      const body = await invoiceRes.text();
      logger.error('[NOWPayments API] Invoice creation failed', {
        status: invoiceRes.status,
        body,
        tier,
      });
      res.status(502).json({ error: 'Payment provider unavailable' });
      return;
    }

    const invoice = (await invoiceRes.json()) as {
      id: string;
      invoice_url: string;
      token_id?: string;
    };

    logger.info('[NOWPayments API] Invoice created', {
      invoiceId: invoice.id,
      tier,
      orderId,
    });

    res.json({
      invoiceId: invoice.id,
      checkoutUrl: invoice.invoice_url,
    });
  } catch (error) {
    logger.error('[NOWPayments API] Invoice creation error', { error: String(error) });
    res.status(502).json({ error: 'Payment provider unavailable' });
  }
});
