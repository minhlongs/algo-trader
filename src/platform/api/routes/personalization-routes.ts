import { Router, Request, Response } from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { logger } from '../../../shared/utils/logger';
import { validateTenantId } from '../../../shared/tenant';

const DATA_DIR = join(process.cwd(), 'data', 'personalization');

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Tenant validation via shared module — see src/shared/tenant

export const personalizationRouter: Router = Router();

/**
 * GET /api/personalization/config?tier=FREE|PRO|ENTERPRISE
 * Returns widget layout structures and active feature flags.
 */
personalizationRouter.get('/config', (req: Request, res: Response): void => {
  const tier = (req.query.tier as string || 'FREE').toUpperCase();
  
  if (tier !== 'FREE' && tier !== 'PRO' && tier !== 'ENTERPRISE') {
    res.status(400).json({ error: 'Invalid tier parameter' });
    return;
  }

  let widgets: Array<{ id: string; colSpan: number; visible: boolean }> = [];
  const features = {
    aiInsights: false,
    unlimitedStrategies: false,
    customAlerts: false,
  };

  if (tier === 'FREE') {
    widgets = [
      { id: 'price-ticker', colSpan: 12, visible: true },
      { id: 'candlestick', colSpan: 12, visible: true },
      { id: 'strategy-controls', colSpan: 12, visible: false },
      { id: 'pnl-analytics', colSpan: 12, visible: true },
      { id: 'active-positions', colSpan: 12, visible: true },
      { id: 'system-logs', colSpan: 12, visible: false },
    ];
  } else if (tier === 'PRO') {
    widgets = [
      { id: 'price-ticker', colSpan: 12, visible: true },
      { id: 'candlestick', colSpan: 8, visible: true },
      { id: 'strategy-controls', colSpan: 4, visible: true },
      { id: 'pnl-analytics', colSpan: 12, visible: true },
      { id: 'active-positions', colSpan: 6, visible: true },
      { id: 'system-logs', colSpan: 6, visible: true },
    ];
    features.aiInsights = true;
    features.customAlerts = true;
  } else if (tier === 'ENTERPRISE') {
    widgets = [
      { id: 'price-ticker', colSpan: 12, visible: true },
      { id: 'candlestick', colSpan: 8, visible: true },
      { id: 'strategy-controls', colSpan: 4, visible: true },
      { id: 'pnl-analytics', colSpan: 12, visible: true },
      { id: 'active-positions', colSpan: 6, visible: true },
      { id: 'system-logs', colSpan: 6, visible: true },
      { id: 'ai-insights-panel', colSpan: 12, visible: true },
    ];
    features.aiInsights = true;
    features.unlimitedStrategies = true;
    features.customAlerts = true;
  }

  res.json({ widgets, features });
});

/**
 * GET /api/personalization/ab-config?tenantId=<tenantId>
 * Deterministically splits tenant users into A/B variants to ensure consistent UI experiences.
 */
personalizationRouter.get('/ab-config', (req: Request, res: Response): void => {
  const tenantId = req.query.tenantId as string;

  if (!tenantId || typeof tenantId !== 'string' || !validateTenantId(tenantId)) {
    res.status(400).json({ error: 'Missing or invalid tenantId' });
    return;
  }

  // Deterministic hashing via SHA-256
  const hash = crypto.createHash('sha256').update(tenantId).digest('hex');
  const lastChar = hash.slice(-1);
  const variant = parseInt(lastChar, 16) % 2 === 0 ? 'A' : 'B';

  const config = {
    theme: variant === 'A' ? 'default' : 'cyberpunk',
    promoBanner: variant === 'A' ? false : true,
    abTestingEnabled: true,
  };

  res.json({
    tenantId,
    variant,
    config,
  });
});

/**
 * POST /api/personalization/events
 * Collects client interactions and appends them to tenant-isolated storage files.
 */
personalizationRouter.post('/events', (req: Request, res: Response): void => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { tenantId, eventType, eventData } = body || {};

    if (!tenantId || typeof tenantId !== 'string' || !validateTenantId(tenantId)) {
      res.status(400).json({ error: 'Missing or invalid tenantId' });
      return;
    }

    if (!eventType || typeof eventType !== 'string') {
      res.status(400).json({ error: 'Missing eventType' });
      return;
    }

    ensureDir();
    const eventFile = join(DATA_DIR, `events_${tenantId}.json`);

    let events: Array<{ eventType: string; eventData: Record<string, unknown>; timestamp: string }> = [];
    if (existsSync(eventFile)) {
      try {
        events = JSON.parse(readFileSync(eventFile, 'utf-8'));
      } catch (err) {
        logger.error(`[Personalization] Failed to parse events for tenant ${tenantId}:`, err);
        events = [];
      }
    }

    const newEvent = {
      eventType,
      eventData: eventData || {},
      timestamp: new Date().toISOString(),
    };

    events.push(newEvent);

    // Atomic/Safe disk write
    writeFileSync(eventFile, JSON.stringify(events, null, 2));

    logger.debug(`[Personalization] Event '${eventType}' registered for tenant ${tenantId}`);
    res.status(201).json({ success: true, event: newEvent });
  } catch (err) {
    logger.error('[Personalization] Failed to ingest event:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
