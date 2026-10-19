// SPDX-License-Identifier: MIT
/**
 * Stitch UI Cockpit & Emergency Kill-Switch API Routes (16-Screen Suite)
 * Serves Stitch UI PRD state, themes, SOR mesh (#13), Regime-Kelly (#14), Hawkes Radar (#15), Queue Cockpit (#16), and Auditor.
 *
 * @module platform/api/routes/stitch-cockpit-routes
 */

import { Router, type Request, type Response } from 'express';
import {
  StitchUiCockpitEngine,
  STITCH_8_SCREENS,
  STITCH_DESIGN_THEMES,
  UiUxProMaxAuditor,
} from '../../../desk/opencoresaas2026monetization/stitch-ui-cockpit';
import { sanitizeHttpError } from '../../../shared/utils/error-sanitize';
import {
  hawkesRadarQuerySchema,
  killSwitchBodySchema,
  queueReactiveQuerySchema,
  regimeKellyQuerySchema,
  snapshotQuerySchema,
  sorMeshQuerySchema,
} from './stitch-cockpit-schemas';
import { registerAdvancedCockpitRoutes } from './stitch-cockpit-advanced-routes';

export * from './stitch-cockpit-schemas';

export const stitchCockpitRouter = Router();
const cockpitEngine = new StitchUiCockpitEngine();
registerAdvancedCockpitRoutes(stitchCockpitRouter, cockpitEngine);

stitchCockpitRouter.get('/screens', (_req: Request, res: Response) => {
  res.status(200).json({
    ok: true,
    screensCount: STITCH_8_SCREENS.length,
    screens: STITCH_8_SCREENS,
    themes: STITCH_DESIGN_THEMES,
  });
});

stitchCockpitRouter.get('/snapshot', (req: Request, res: Response) => {
  try {
    const parsed = snapshotQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ ok: false, reason: 'Invalid cockpit query parameters', issues: parsed.error.issues });
      return;
    }
    const { tenantId, tier, theme } = parsed.data;
    const snapshot = cockpitEngine.getCockpitSnapshot(tenantId, tier, theme);
    res.status(200).json({ ok: true, snapshot });
  } catch (err) {
    res.status(500).json(sanitizeHttpError(err));
  }
});

stitchCockpitRouter.post('/kill-switch', (req: Request, res: Response) => {
  try {
    const parsed = killSwitchBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, reason: 'Invalid kill-switch request payload', issues: parsed.error.issues });
      return;
    }
    const result = cockpitEngine.triggerEmergencyKillSwitch(parsed.data.tenantId, parsed.data.reason);
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json(sanitizeHttpError(err));
  }
});

stitchCockpitRouter.get('/sor-mesh', (req: Request, res: Response) => {
  try {
    const parsed = sorMeshQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ ok: false, reason: 'Invalid SOR mesh query parameters', issues: parsed.error.issues });
      return;
    }
    const sorMesh = cockpitEngine.getSorMeshSnapshot(parsed.data.algorithm, parsed.data.parentOrderNotionalUsd);
    res.status(200).json({ ok: true, sorMesh });
  } catch (err) {
    res.status(500).json(sanitizeHttpError(err));
  }
});

stitchCockpitRouter.get('/ui-ux-audit', (_req: Request, res: Response) => {
  try {
    const auditor = new UiUxProMaxAuditor();
    const audit = auditor.auditPublicDirectory();
    res.status(200).json({ ok: true, audit });
  } catch (err) {
    res.status(500).json(sanitizeHttpError(err));
  }
});

stitchCockpitRouter.get('/regime-kelly', (req: Request, res: Response) => {
  try {
    const parsed = regimeKellyQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ ok: false, reason: 'Invalid regime-kelly query parameters', issues: parsed.error.issues });
      return;
    }
    const regimeKelly = cockpitEngine.getRegimeKellySnapshot(parsed.data.activeRegime, parsed.data.portfolioEquityUsd);
    res.status(200).json({ ok: true, regimeKelly });
  } catch (err) {
    res.status(500).json(sanitizeHttpError(err));
  }
});

stitchCockpitRouter.get('/hawkes-radar', (req: Request, res: Response) => {
  try {
    const parsed = hawkesRadarQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ ok: false, reason: 'Invalid hawkes-radar query parameters', issues: parsed.error.issues });
      return;
    }
    const hawkesRadar = cockpitEngine.getHawkesRadarSnapshot(parsed.data.inventoryUnits, parsed.data.riskAversionGamma);
    res.status(200).json({ ok: true, hawkesRadar });
  } catch (err) {
    res.status(500).json(sanitizeHttpError(err));
  }
});

stitchCockpitRouter.get('/queue-reactive', (req: Request, res: Response) => {
  try {
    const parsed = queueReactiveQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ ok: false, reason: 'Invalid queue-reactive query parameters', issues: parsed.error.issues });
      return;
    }
    const queueReactive = cockpitEngine.getQueueReactiveSnapshot(parsed.data.bestBidQueueSizeLots, parsed.data.bestAskQueueSizeLots);
    res.status(200).json({ ok: true, queueReactive });
  } catch (err) {
    res.status(500).json(sanitizeHttpError(err));
  }
});

