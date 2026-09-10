/**
 * Signal Subscription Routes - Core Subscription Handlers
 */

import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { signalSubscriberRepo } from '../../signal/signal-subscriber-repository-d1';
import { usageMetering } from '../../signals-api/usage-metering-service';
import { resolveSubscriberId } from '../../middleware/signal-tier-resolver';
import { logger } from '../../../shared/utils/logger';
import { subscribeBodySchema } from './signal-subscription-types';

export async function handleListActiveSubscriptions(_req: Request, res: Response): Promise<void> {
  try {
    const subs = await signalSubscriberRepo.getActiveSubscriptions();
    res.json({ data: subs });
  } catch (err) {
    logger.error('[SignalSub] List active error', { err });
    res.status(500).json({ error: 'Failed to list subscriptions' });
  }
}

export async function handleGetTenantSubscription(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId as string;
    const sub = await signalSubscriberRepo.getBySubscriberId(tenantId);
    if (!sub) {
      res.status(404).json({ error: 'Subscription not found' });
      return;
    }
    res.json({ data: sub });
  } catch (err) {
    logger.error('[SignalSub] Get by tenant error', { err });
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
}

export async function handleCreateSubscription(req: Request, res: Response): Promise<void> {
  const identity = resolveSubscriberId(req);
  if (!identity) {
    res.status(401).json({ error: 'Valid API key required' });
    return;
  }
  const parsed = subscribeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' });
    return;
  }
  try {
    const { subscriberId, tier } = identity;
    const existing = await signalSubscriberRepo.getBySubscriberId(subscriberId);
    const now = Date.now();
    const sub = {
      id: existing?.id ?? randomUUID(),
      subscriberId,
      tier,
      active: true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await signalSubscriberRepo.upsert(sub);
    if (parsed.data.chatId != null) {
      await signalSubscriberRepo.upsert({ ...sub, chatId: parsed.data.chatId });
    }
    logger.info('[SignalSub] Subscription created/updated', { subscriberId, tier });
    res.json({ data: sub, message: 'Subscription updated' });
  } catch (err) {
    logger.error('[SignalSub] Create/update error', { err });
    res.status(500).json({ error: 'Failed to create subscription' });
  }
}

export async function handleCancelSubscription(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const existing = await signalSubscriberRepo.getActiveSubscriptions();
    const found = existing.some((s) => s.id === id);
    if (!found) {
      res.status(404).json({ error: 'Subscription not found or already cancelled' });
      return;
    }
    await signalSubscriberRepo.setActive(id, false);
    res.json({ message: 'Subscription cancelled' });
  } catch (err) {
    logger.error('[SignalSub] Cancel error', { err });
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
}

export async function handleGetCurrentSubscription(req: Request, res: Response): Promise<void> {
  const identity = resolveSubscriberId(req);
  if (!identity) {
    res.status(401).json({ error: 'Valid API key required' });
    return;
  }
  try {
    const sub = await signalSubscriberRepo.getBySubscriberId(identity.subscriberId);
    if (!sub) {
      res.status(404).json({ error: 'Not subscribed' });
      return;
    }
    res.json({ data: sub });
  } catch (err) {
    logger.error('[SignalSub] GET /subscription error', { err });
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
}

export async function handleGetUsageSnapshot(req: Request, res: Response): Promise<void> {
  try {
    const subscriberId = req.params.subscriberId as string;
    if (!subscriberId || subscriberId.trim() === '') {
      res.status(400).json({ error: 'subscriberId required' });
      return;
    }

    const snapshot = await usageMetering.getSnapshot(subscriberId);
    if (!snapshot) {
      res.status(404).json({ error: 'No usage data for subscriber' });
      return;
    }

    res.json({
      subscriberId: snapshot.subscriberId,
      period: snapshot.period,
      callsThisPeriod: snapshot.callsThisPeriod,
      periodLimit: snapshot.periodLimit,
      overage: snapshot.overageCalls,
    });
  } catch (err) {
    logger.error('[SignalSub] Usage snapshot error', { err });
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
}
