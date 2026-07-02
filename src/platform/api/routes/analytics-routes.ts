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
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';

const DATA_DIR = join(process.cwd(), 'data', 'analytics');
const EVENTS_FILE = join(DATA_DIR, 'events.json');

interface AnalyticsEvent {
  event: string;
  ref: string;
  utm: { source: string; medium: string; campaign: string } | null;
  url: string;
  ts: number;
  ip?: string;
  // Engagement tracking fields (Phase 34b)
  duration?: number;  // time-on-page in seconds
  scrollDepth?: number; // 0–100 percentage
  loadTime?: number;  // page load time in ms
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
analyticsRouter.post('/event', requireTier('FREE'), (req: Request, res: Response) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || !body.event) {
      res.status(400).json({ error: 'Missing event field' });
      return;
    }

    const evt: AnalyticsEvent = {
      event: String(body.event).slice(0, 100),
      ref: String(body.ref || '').slice(0, 50),
      utm: body.utm ? {
        source: String(body.utm.source || '').slice(0, 100),
        medium: String(body.utm.medium || '').slice(0, 100),
        campaign: String(body.utm.campaign || '').slice(0, 100),
      } : null,
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

// GET /referrals — referral attribution summary (admin, Bearer token required)
analyticsRouter.get('/referrals', requireTier('FREE'), (req: Request, res: Response) => {
  const metricsToken = process.env.METRICS_TOKEN;
  if (!metricsToken) { res.status(403).json({ error: 'Not configured' }); return; }
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token || token !== metricsToken) { res.status(403).json({ error: 'Forbidden' }); return; }
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

// ─── Engagement Analytics (Phase 34b) ─────────────────────────────

// POST /page-view — Track page view with optional duration + scroll depth
analyticsRouter.post('/page-view', requireTier('FREE'), (req: Request, res: Response) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || !body.url) {
      res.status(400).json({ error: 'Missing url field' });
      return;
    }

    const evt: AnalyticsEvent = {
      event: 'page_view',
      ref: String(body.ref || '').slice(0, 50),
      utm: body.utm ? {
        source: String(body.utm.source || '').slice(0, 100),
        medium: String(body.utm.medium || '').slice(0, 100),
        campaign: String(body.utm.campaign || '').slice(0, 100),
      } : null,
      url: String(body.url).slice(0, 200),
      ts: Date.now(),
      duration: typeof body.duration === 'number' ? Math.round(body.duration) : undefined,
      scrollDepth: typeof body.scrollDepth === 'number' ? Math.min(100, Math.max(0, Math.round(body.scrollDepth))) : undefined,
      loadTime: typeof body.loadTime === 'number' ? Math.round(body.loadTime) : undefined,
    };

    const events = loadEvents();
    events.push(evt);
    saveEvents(events);

    res.status(204).end();
  } catch {
    res.status(400).json({ error: 'Invalid payload' });
  }
});

// POST /time-on-page — Track time-on-page beacon (fired on beforeunload / visibilitychange)
analyticsRouter.post('/time-on-page', requireTier('FREE'), (req: Request, res: Response) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || !body.url || typeof body.duration !== 'number') {
      res.status(400).json({ error: 'Missing url or duration field' });
      return;
    }

    const evt: AnalyticsEvent = {
      event: 'time_on_page',
      ref: String(body.ref || '').slice(0, 50),
      utm: null,
      url: String(body.url).slice(0, 200),
      ts: Date.now(),
      duration: Math.max(0, Math.round(body.duration)),
      scrollDepth: typeof body.scrollDepth === 'number' ? Math.min(100, Math.max(0, Math.round(body.scrollDepth))) : undefined,
    };

    const events = loadEvents();
    events.push(evt);
    saveEvents(events);

    res.status(204).end();
  } catch {
    res.status(400).json({ error: 'Invalid payload' });
  }
});

// GET /engagement — Engagement summary (admin, Bearer token required)
analyticsRouter.get('/engagement', requireTier('FREE'), (req: Request, res: Response) => {
  const metricsToken = process.env.METRICS_TOKEN;
  if (!metricsToken) { res.status(403).json({ error: 'Not configured' }); return; }
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token || token !== metricsToken) { res.status(403).json({ error: 'Forbidden' }); return; }

  const events = loadEvents();
  const pageViews = events.filter(e => e.event === 'page_view');
  const timeOnPage = events.filter(e => e.event === 'time_on_page' && typeof e.duration === 'number');

  const avgDuration = timeOnPage.length > 0
    ? Math.round(timeOnPage.reduce((s, e) => s + (e.duration || 0), 0) / timeOnPage.length)
    : 0;

  const avgScroll = pageViews.length > 0
    ? Math.round(pageViews.reduce((s, e) => s + (e.scrollDepth || 0), 0) / pageViews.length)
    : 0;

  const urlCounts: Record<string, number> = {};
  for (const e of pageViews) {
    if (e.url) urlCounts[e.url] = (urlCounts[e.url] || 0) + 1;
  }

  res.json({
    totalPageViews: pageViews.length,
    totalTimeOnPageEvents: timeOnPage.length,
    avgDurationSeconds: avgDuration,
    avgScrollDepthPercent: avgScroll,
    topPages: Object.entries(urlCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([url, count]) => ({ url, count })),
  });
});
