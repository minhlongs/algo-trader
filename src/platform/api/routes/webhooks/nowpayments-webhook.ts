/**
 * NOWPayments IPN Webhook Routes (Express)
 * Handles crypto payment notifications via HMAC-SHA512 signed webhooks
 *
 * Dispatch logic:
 * - order_id starts with "sig_"  → signals API subscription flow
 * - order_id starts with "mp_"   → marketplace strategy subscription flow
 * - anything else                → platform license subscription flow
 *
 * IPN statuses handled:
 * - finished → activate subscription
 * - refunded → cancel subscription
 * - failed/expired → log + cancel
 * - waiting/confirming/confirmed/sending → ignore (intermediate)
 */

import { Router, Request, Response } from 'express';
import { NowPaymentsService, NowPaymentsIpnPayload } from '../../../billing/nowpayments-service';
import { SubscriptionService } from '../../../billing/subscription-service';
import { PaymentService } from '../../../billing/payment-service';
import { LicenseService } from '../../../billing/license-service';
import { AuditLogService } from '../../../audit/audit-log-service';
import { signalSubscriberRepo } from '../../../signal/signal-subscriber-repository-d1';
import { logger } from '../../../../shared/utils/logger';
import {
  handleIpnFinished,
  handleIpnRefunded,
  handleIpnPaymentSuccess,
  handleIpnPaymentFailed,
  handleMarketplaceIpnFinished,
  handleMarketplaceIpnCancelled,
  handleSignalsIpnFinished,
  handleSignalsIpnCancelled,
} from './handlers';

export const nowpaymentsWebhookRouter: Router = Router();

// Capture raw body BEFORE express.json() parses it (needed for HMAC verification)
nowpaymentsWebhookRouter.use(
  require('express').json({
    verify: (req: Request, _res: Response, buf: Buffer) => {
      (req as Request & { rawBody?: string }).rawBody = buf.toString('utf-8');
    },
  })
);

nowpaymentsWebhookRouter.post('/', async (req: Request, res: Response) => {
  const nowpaymentsService = NowPaymentsService.getInstance();
  const subscriptionService = SubscriptionService.getInstance();
  const paymentService = PaymentService.getInstance();
  const licenseService = LicenseService.getInstance();
  const auditService = AuditLogService.getInstance();

  const signature = req.headers['x-nowpayments-sig'] as string;
  const rawBody = (req as Request & { rawBody?: string }).rawBody || JSON.stringify(req.body);

  if (!signature) {
    return res.status(400).json({ error: 'Missing x-nowpayments-sig header' });
  }

  const isValid = await nowpaymentsService.verifyWebhook(rawBody, signature);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid IPN signature' });
  }

  try {
    const ipn = req.body as NowPaymentsIpnPayload;

    // Coerce payment_id to string (NOWPayments sends it as number)
    ipn.payment_id = String(ipn.payment_id);

    const action = nowpaymentsService.getStatusAction(ipn.payment_status);

    // Dispatch by order_id prefix: sig_=signals, mp_=marketplace, else=platform
    const orderId = ipn.order_id ?? '';
    const isSignals = orderId.startsWith('sig_');
    const isMarketplace = orderId.startsWith('mp_');

    logger.info(`[NOWPayments IPN] payment_id=${ipn.payment_id} status=${ipn.payment_status} action=${action} signals=${isSignals} marketplace=${isMarketplace}`);

    if (isSignals) {
      // Signals API subscription payment flow
      switch (action) {
        case 'activate':
          await handleSignalsIpnFinished(ipn);
          await handleIpnPaymentSuccess(ipn, paymentService);
          break;
        case 'cancel':
          await handleSignalsIpnCancelled(ipn);
          await handleIpnPaymentFailed(ipn, paymentService);
          break;
        case 'ignore':
          logger.info(`[NOWPayments IPN] Intermediate signals status ${ipn.payment_status}, no action`);
          break;
      }
    } else if (isMarketplace) {
      // Marketplace strategy subscription payment flow
      switch (action) {
        case 'activate':
          await handleMarketplaceIpnFinished(ipn, nowpaymentsService);
          await handleIpnPaymentSuccess(ipn, paymentService);
          break;
        case 'cancel':
          await handleMarketplaceIpnCancelled(ipn);
          await handleIpnPaymentFailed(ipn, paymentService);
          break;
        case 'ignore':
          logger.info(`[NOWPayments IPN] Intermediate marketplace status ${ipn.payment_status}, no action`);
          break;
      }
    } else {
      // Platform license subscription payment flow
      switch (action) {
        case 'activate':
          await handleIpnFinished(ipn, nowpaymentsService, subscriptionService, licenseService, auditService);
          await handleIpnPaymentSuccess(ipn, paymentService);
          break;

        case 'cancel':
          if (ipn.payment_status === 'refunded') {
            await handleIpnRefunded(ipn, subscriptionService);
          }
          await handleIpnPaymentFailed(ipn, paymentService);
          break;

        case 'ignore':
          logger.info(`[NOWPayments IPN] Intermediate status ${ipn.payment_status}, no action`);
          break;
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    logger.error('[NOWPayments IPN] Processing error:', { error });
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});
