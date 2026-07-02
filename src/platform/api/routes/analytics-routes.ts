/**
 * Analytics & Strategy Performance API Routes (Express)
 * Receives referral + conversion events from landing page analytics.js
 * Stores in data/referrals.json for attribution tracking.
 *
 * Endpoints:
 * - POST /api/analytics/event — receive tracked event (via sendBeacon)
 * - GET  /api/analytics/referrals — list referral stats (admin only)
 * - GET  /api/v1/strategy-performance — backtest strategy results from CSV
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

// ─── Strategy Performance (from backtest CSV) ─────────────────────────

interface StrategyResult {
  strategy: string;
  sharpe_ratio: number;
  win_rate_pct: number;
  total_pnl_usd: number;
  profit_factor: number;
  max_drawdown_pct: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  avg_pnl_per_trade_usd: number;
  best_trade_usd: number;
  worst_trade_usd: number;
  duration_ms: number;
  status: string;
}

/**
 * Parse the backtest CSV into structured strategy result objects.
 * Returns an empty array on any read or parse error (logged but not thrown).
 */
function parseStrategyCsv(): StrategyResult[] {
  const csvPath = join(process.cwd(), 'reports', 'backtest-results.csv');
  if (!existsSync(csvPath)) {
    logger.warn('[StrategyPerformance] CSV not found at', { path: csvPath });
    return [];
  }

  try {
    const raw = readFileSync(csvPath, 'utf-8').trim();
    if (!raw) return [];

    const lines = raw.split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim());
    const results: StrategyResult[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const vals = line.split(',');
      if (vals.length < headers.length) continue;

      const row: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = vals[j]?.trim() ?? '';
      }

      const totalTrades = Number(row.total_trades) || 0;

      const result: StrategyResult = {
        strategy: row.strategy ?? '',
        sharpe_ratio: Number(row.sharpe_ratio) || 0,
        win_rate_pct: Number(row.win_rate_pct) || 0,
        total_pnl_usd: Number(row.total_pnl_usd) || 0,
        profit_factor: row.profit_factor === 'Infinity' ? Infinity : Number(row.profit_factor) || 0,
        max_drawdown_pct: Number(row.max_drawdown_pct) || 0,
        total_trades: totalTrades,
        winning_trades: Number(row.winning_trades) || 0,
        losing_trades: Number(row.losing_trades) || 0,
        avg_pnl_per_trade_usd: Number(row.avg_pnl_per_trade_usd) || 0,
        best_trade_usd: Number(row.best_trade_usd) || 0,
        worst_trade_usd: Number(row.worst_trade_usd) || 0,
        duration_ms: Number(row.duration_ms) || 0,
        status: row.status ?? '',
      };

      results.push(result);
    }

    return results;
  } catch (err) {
    logger.error('[StrategyPerformance] Failed to parse CSV', { err: String(err) });
    return [];
  }
}

/** Router mounted at /api/v1/strategy-performance */
export const strategyPerformanceRouter: RouterType = Router();

strategyPerformanceRouter.get('/', requireTier('FREE'), (_req: Request, res: Response) => {
  try {
    const strategies = parseStrategyCsv();
    res.json(strategies);
  } catch (err) {
    logger.error('[StrategyPerformance] Handler error', { err: String(err) });
    res.status(500).json({ error: 'Failed to load strategy performance data' });
  }
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
