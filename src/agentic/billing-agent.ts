import { logger } from '../shared/utils/logger';

export interface Payment {
  paymentId: string;
  email: string;
  amount: number;
  currency: string;
  tier: string;
}

interface RevenueBreakdown {
  platform: number;
  provider: number;
  platformPct: number;
  providerPct: number;
}

const SPLIT_BY_TIER: Record<string, { platform: number; provider: number }> = {
  STARTER: { platform: 0.7, provider: 0.3 },
  PRO: { platform: 0.7, provider: 0.3 },
  ENTERPRISE: { platform: 0.6, provider: 0.4 },
  MASTER: { platform: 0.6, provider: 0.4 },
  ELITE: { platform: 0.6, provider: 0.4 },
};

export class BillingAgent {
  private readonly processedPaymentIds: Set<string> = new Set();
  private readonly alertOperatorThreshold = 299;

  onPaymentCompleted(payment: Payment): void {
    if (this.processedPaymentIds.has(payment.paymentId)) return;
    this.processedPaymentIds.add(payment.paymentId);

    const breakdown = this.generateRevenueShareBreakdown(payment.amount, payment.tier);
    this.recordRevenueShare(payment.paymentId, breakdown);
    this.alertOperatorIfHighValue(payment.amount, payment.email);

    this.generateInvoiceAndEmail(payment).catch((err) => {
      logger.error('[BillingAgent] Invoice generation failed', {
        paymentId: payment.paymentId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  private generateRevenueShareBreakdown(amount: number, tier: string): RevenueBreakdown {
    const upper = tier.toUpperCase();
    const split = SPLIT_BY_TIER[upper] ?? SPLIT_BY_TIER.STARTER;
    return {
      platform: Math.round(amount * split.platform * 100) / 100,
      provider: Math.round(amount * split.provider * 100) / 100,
      platformPct: split.platform,
      providerPct: split.provider,
    };
  }

  private recordRevenueShare(paymentId: string, breakdown: RevenueBreakdown): void {
    logger.info('[BillingAgent] Revenue share recorded', { paymentId, ...breakdown });
  }

  private alertOperatorIfHighValue(amount: number, email: string): void {
    if (amount >= this.alertOperatorThreshold) {
      logger.warn('[BillingAgent] High-value payment alert', {
        amount,
        email,
        threshold: this.alertOperatorThreshold,
      });
    }
  }

  private async generateInvoiceAndEmail(payment: Payment): Promise<void> {
    const { generateInvoice } = await import('../platform/billing/invoice-generator');
    await generateInvoice({
      paymentId: payment.paymentId,
      email: payment.email,
      tier: payment.tier,
      amount: payment.amount,
      currency: payment.currency,
    });
    logger.info('[BillingAgent] Invoice generated', { paymentId: payment.paymentId });
  }
}
