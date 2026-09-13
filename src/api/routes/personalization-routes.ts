/**
 * Personalization & A/B Testing Routes
 * GET  /api/personalization/config?tier=<FREE|PRO|ENTERPRISE>  — widget configs + feature flags
 * GET  /api/personalization/ab-config?tenantId=<tenantId>      — deterministic A/B variant assignment
 * POST /api/personalization/events                              — tenant-isolated analytics event storage
 */

import { Router, Request, Response } from 'express';
import { logger } from '../../shared/utils/logger';
import {
  configQuerySchema,
  abConfigQuerySchema,
  assignVariant,
  getWidgetConfig,
} from './personalization-config';
import {
  eventBodySchema,
  recordPersonalizationEvent,
} from './personalization-events';

export const personalizationRouter: Router = Router();

export {
  TIER_SCHEMA,
  configQuerySchema,
  abConfigQuerySchema,
  assignVariant,
  getWidgetConfig,
} from './personalization-config';

export {
  DATA_DIR,
  eventBodySchema,
  ensureDataDir,
  getEventsFilePath,
  recordPersonalizationEvent,
} from './personalization-events';

/**
 * GET /api/personalization/config?tier=<FREE|PRO|ENTERPRISE>
 * Returns widget configurations and feature flags for the given tier
 */
personalizationRouter.get('/config', async (req: Request, res: Response) => {
  try {
    const parsed = configQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' });
    }

    const { tier } = parsed.data;
    const config = getWidgetConfig(tier);

    logger.info('[Personalization] Config requested', { tier });
    return res.json(config);
  } catch (err) {
    logger.error('[Personalization] GET /config failed', { err });
    return res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET /api/personalization/ab-config?tenantId=<tenantId>
 * Returns deterministic A/B variant assignment for the tenant
 */
personalizationRouter.get('/ab-config', async (req: Request, res: Response) => {
  try {
    const parsed = abConfigQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' });
    }

    const { tenantId } = parsed.data;
    const variant = assignVariant(tenantId);

    const config = {
      theme: variant === 'A' ? 'default' : 'cyberpunk',
      promoBanner: variant === 'B',
      abTestingEnabled: true,
    };

    const response = {
      tenantId,
      variant,
      config,
    };

    logger.info('[Personalization] A/B config requested', { tenantId, variant });
    return res.json(response);
  } catch (err) {
    logger.error('[Personalization] GET /ab-config failed', { err });
    return res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * POST /api/personalization/events
 * Receives analytics events and stores them in tenant-isolated JSON files
 */
personalizationRouter.post('/events', async (req: Request, res: Response) => {
  try {
    const parsed = eventBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
    }

    const { tenantId, eventType, eventData } = parsed.data;
    const result = await recordPersonalizationEvent(tenantId, eventType, eventData);
    return res.status(201).json(result);
  } catch (err) {
    logger.error('[Personalization] POST /events failed', { err });
    return res.status(500).json({ error: 'Internal error' });
  }
});
