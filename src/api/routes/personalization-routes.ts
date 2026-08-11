/**
 * Personalization & A/B Testing Routes
 * GET  /api/personalization/config?tier=<FREE|PRO|ENTERPRISE>  — widget configs + feature flags
 * GET  /api/personalization/ab-config?tenantId=<tenantId>      — deterministic A/B variant assignment
 * POST /api/personalization/events                              — tenant-isolated analytics event storage
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../../shared/utils/logger';

export const personalizationRouter: Router = Router();

const DATA_DIR = path.resolve(process.cwd(), 'data', 'personalization');

const TIER_SCHEMA = z.enum(['FREE', 'PRO', 'ENTERPRISE']);

const configQuerySchema = z.object({
  tier: TIER_SCHEMA.default('FREE'),
});

const abConfigQuerySchema = z.object({
  tenantId: z.string().min(1, 'tenantId is required'),
});

const eventBodySchema = z.object({
  tenantId: z.string().min(1, 'tenantId is required'),
  eventType: z.string().min(1, 'eventType is required'),
  eventData: z.record(z.string(), z.unknown()).optional(),
});

/** Ensure data directory exists */
async function ensureDataDir(): Promise<void> {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

/** Get events file path for a tenant */
function getEventsFilePath(tenantId: string): string {
  const safeTenantId = tenantId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(DATA_DIR, `events_${safeTenantId}.json`);
}

/** Deterministically assign A/B variant from tenantId */
function assignVariant(tenantId: string): 'A' | 'B' {
  let hash = 0;
  for (let i = 0; i < tenantId.length; i++) {
    hash = ((hash << 5) - hash) + tenantId.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash) % 2 === 0 ? 'A' : 'B';
}

/** Widget configurations per tier */
function getWidgetConfig(tier: 'FREE' | 'PRO' | 'ENTERPRISE') {
  const baseWidgets = [
    { id: 'price-ticker', colSpan: 12, visible: true },
    { id: 'candlestick', colSpan: 8, visible: true },
    { id: 'strategy-controls', colSpan: 4, visible: true },
  ];

  if (tier === 'FREE') {
    return {
      widgets: baseWidgets,
      features: {
        aiInsights: false,
        unlimitedStrategies: false,
        customAlerts: false,
      },
    };
  }

  if (tier === 'PRO') {
    return {
      widgets: [
        ...baseWidgets,
        { id: 'pnl-analytics', colSpan: 12, visible: true },
        { id: 'active-positions', colSpan: 6, visible: true },
      ],
      features: {
        aiInsights: true,
        unlimitedStrategies: true,
        customAlerts: false,
      },
    };
  }

  // ENTERPRISE
  return {
    widgets: [
      ...baseWidgets,
      { id: 'pnl-analytics', colSpan: 12, visible: true },
      { id: 'active-positions', colSpan: 6, visible: true },
      { id: 'ai-insights-panel', colSpan: 12, visible: true },
    ],
    features: {
      aiInsights: true,
      unlimitedStrategies: true,
      customAlerts: true,
    },
  };
}

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

    await ensureDataDir();

    const filePath = getEventsFilePath(tenantId);
    const timestamp = new Date().toISOString();

    const eventRecord = {
      tenantId,
      eventType,
      eventData,
      timestamp,
    };

    // Read existing events
    let events: typeof eventRecord[] = [];
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      events = JSON.parse(content);
      if (!Array.isArray(events)) events = [];
    } catch {
      // File doesn't exist or invalid JSON - start fresh
      events = [];
    }

    // Append new event
    events.push(eventRecord);

    // Keep only last 1000 events per tenant to prevent unbounded growth
    if (events.length > 1000) {
      events = events.slice(-1000);
    }

    // Write back
    await fs.writeFile(filePath, JSON.stringify(events, null, 2), 'utf-8');

    logger.info('[Personalization] Event recorded', { tenantId, eventType });
    return res.status(201).json({ status: 'created', eventId: `${tenantId}_${Date.now()}` });
  } catch (err) {
    logger.error('[Personalization] POST /events failed', { err });
    return res.status(500).json({ error: 'Internal error' });
  }
});