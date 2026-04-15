/**
 * Analytics API Routes (Express)
 * Receives referral + conversion events from landing page analytics.js
 * Stores in data/referrals.json for attribution tracking.
 *
 * Endpoints:
 * - POST /api/analytics/event — receive tracked event (via sendBeacon)
 * - GET  /api/analytics/referrals — list referral stats (admin only)
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../../utils/logger.js';

const DATA_DIR = join(process.cwd(), 'data', 'analytics');
const EVENTS_FILE = join(DATA_DIR, 'events.json');

interface AnalyticsEvent {
  event: string;
  ref: string;
  utm: { source: string; medium: string; campaign: string } | null;
  url: string;
  ts: number;
  ip?: string;
}

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadEvents(): AnalyticsEvent[] {
  ensureDir();
  if (!existsSync(EVENTS_FILE)) return [];
  try { return JSON.parse(readFileSync(EVENTS_FILE, 'utf-8')); }
  catch { return []; }
}

function saveEvents(events: AnalyticsEvent[]): void {
  ensureDir();
  // Keep last 1000 events
  writeFileSync(EVENTS_FILE, JSON.stringify(events.slice(-1000), null, 2));
}

export const analyticsRouter: RouterType = Router();

// POST /event — receive beacon from analytics.js
analyticsRouter.post('/event', (req: Request, res: Response) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || !body.event) {
      res.status(400).json({ error: 'Missing event field' });
      return;
    }

    const evt: AnalyticsEvent = {
      event: String(body.event).slice(0, 100),
      ref: String(body.ref || '').slice(0, 50),
      utm: body.utm || null,
      url: String(body.url || '').slice(0, 200),
      ts: Date.now(),
    };

    const events = loadEvents();
    events.push(evt);
    saveEvents(events);

    logger.debug(`[Analytics] Event: ${evt.event}, ref=${evt.ref}`);
    res.status(204).end();
  } catch {
    res.status(400).json({ error: 'Invalid payload' });
  }
});

// GET /referrals — referral attribution summary (admin)
analyticsRouter.get('/referrals', (req: Request, res: Response) => {
  const events = loadEvents();
  const refCounts: Record<string, number> = {};
  for (const e of events) {
    if (e.ref) {
      refCounts[e.ref] = (refCounts[e.ref] || 0) + 1;
    }
  }
  const sorted = Object.entries(refCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([ref, count]) => ({ ref, count }));

  res.json({ total: events.length, referrals: sorted });
});
