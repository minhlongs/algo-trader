/**
 * Coupon API Route Validation, Auth & NOWPayments Checkout Helpers
 */

import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

// All tiers across all projects (shared NOWPayments account)
export const TIER_PRICES: Record<string, Record<string, { price: number; invoiceId: string }>> = {
  cashclaw: {
    STARTER: { price: 49, invoiceId: '4725459350' },
    PRO: { price: 149, invoiceId: '5493882802' },
    ELITE: { price: 499, invoiceId: '5264305182' },
  },
  openclaw: {
    STARTER: { price: 49, invoiceId: '6245075877' },
    PRO: { price: 149, invoiceId: '5438578229' },
    GROWTH: { price: 399, invoiceId: '5749708735' },
    PREMIUM: { price: 799, invoiceId: '4598891970' },
    MASTER: { price: 4999, invoiceId: '4296538179' },
  },
  sophia: {
    BASIC: { price: 199, invoiceId: '5710519960' },
    STARTER: { price: 199, invoiceId: '5710519960' },
    PREMIUM: { price: 399, invoiceId: '4559269964' },
    GROWTH: { price: 399, invoiceId: '4559269964' },
    ENTERPRISE: { price: 799, invoiceId: '6336799275' },
    MASTER: { price: 4999, invoiceId: '5589879034' },
  },
  mekong: {
    STARTER: { price: 49, invoiceId: '6245075877' },
    PRO: { price: 149, invoiceId: '5438578229' },
  },
};

export const PROJECT_URLS: Record<string, { success: string; cancel: string }> = {
  cashclaw: { success: 'https://cashclaw.cc/dashboard.html', cancel: 'https://cashclaw.cc/#pricing' },
  openclaw: { success: 'https://agencyos.network/dashboard', cancel: 'https://agencyos.network/pricing' },
  sophia: { success: 'https://sophia.agencyos.network/dashboard', cancel: 'https://sophia.agencyos.network/pricing' },
  mekong: { success: 'https://raas-landing.pages.dev/', cancel: 'https://raas-landing.pages.dev/' },
};

const INITIAL_NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY || '';

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const adminKeys = (process.env.ADMIN_API_KEYS || '').split(',').filter(Boolean);
  const defaultKey = process.env.ADMIN_API_KEY;
  if (defaultKey) adminKeys.push(defaultKey);

  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (!apiKey || apiKey.length === 0) {
    res.status(401).json({ error: 'Unauthorized — valid X-API-Key required' });
    return;
  }

  const match = adminKeys.some((key) => {
    if (key.length !== apiKey.length) return false;
    return timingSafeEqual(Buffer.from(key), Buffer.from(apiKey));
  });

  if (!match) {
    res.status(401).json({ error: 'Unauthorized — valid X-API-Key required' });
    return;
  }
  next();
}

export function resolveProjectTierConfig(
  project: string | undefined,
  tier: string,
):
  | { ok: true; projectKey: string; tierKey: string; tierConfig: { price: number; invoiceId: string } }
  | { ok: false; error: string } {
  const projectKey = (project || 'cashclaw').toLowerCase();
  const tierKey = tier.toUpperCase();
  const projectTiers = TIER_PRICES[projectKey];
  if (!projectTiers) {
    return { ok: false, error: `Unknown project: ${projectKey}` };
  }
  const tierConfig = projectTiers[tierKey];
  if (!tierConfig) {
    const validTiers = Object.keys(projectTiers).join(', ');
    return { ok: false, error: `Invalid tier for ${projectKey}. Use: ${validTiers}` };
  }
  return { ok: true, projectKey, tierKey, tierConfig };
}

export async function createCouponNowPaymentsInvoice(
  projectKey: string,
  tierKey: string,
  code: string,
  discountedPrice: number,
  discountPercent: number,
): Promise<{ id?: string }> {
  const urls = PROJECT_URLS[projectKey] || PROJECT_URLS.cashclaw;
  const apiKey = process.env.NOWPAYMENTS_API_KEY || INITIAL_NOWPAYMENTS_API_KEY;
  const invoiceRes = await fetch('https://api.nowpayments.io/v1/invoice', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      price_amount: discountedPrice,
      price_currency: 'usd',
      order_id: `${projectKey}_${tierKey}_coupon_${code}_${Date.now()}`,
      order_description: `${projectKey} ${tierKey} (${discountPercent}% off with ${code})`,
      success_url: urls.success,
      cancel_url: urls.cancel,
    }),
  });
  return (await invoiceRes.json()) as { id?: string };
}
