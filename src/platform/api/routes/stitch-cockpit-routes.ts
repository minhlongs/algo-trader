// SPDX-License-Identifier: MIT
/**
 * Stitch 8-Screen UI Cockpit & Emergency Kill-Switch API Routes
 * Serves the 8-screen Stitch UI PRD state, 3 design system themes, and SHA-256 audited kill-switch.
 *
 * @module platform/api/routes/stitch-cockpit-routes
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  StitchUiCockpitEngine,
  STITCH_8_SCREENS,
  STITCH_DESIGN_THEMES,
} from '../../../desk/opencoresaas2026monetization/stitch-ui-cockpit';
import { sanitizeHttpError } from '../../../shared/utils/error-sanitize';

export const stitchCockpitRouter = Router();
const cockpitEngine = new StitchUiCockpitEngine();

const snapshotQuerySchema = z.object({
  tenantId: z.string().min(1).default('tenant-demo-01'),
  tier: z.enum(['BASIC', 'PREMIUM', 'ENTERPRISE', 'MASTER']).default('PREMIUM'),
  theme: z
    .enum(['OBSIDIAN_QUANTUM', 'BENTO_RAAS_GLASS', 'NORDIC_MINIMALIST_QUANT'])
    .default('OBSIDIAN_QUANTUM'),
});

const killSwitchBodySchema = z.object({
  tenantId: z.string().min(1),
  reason: z.string().min(3).max(240),
});

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
      res.status(400).json({
        ok: false,
        reason: 'Invalid cockpit query parameters',
        issues: parsed.error.issues,
      });
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
      res.status(400).json({
        ok: false,
        reason: 'Invalid kill-switch request payload',
        issues: parsed.error.issues,
      });
      return;
    }
    const result = cockpitEngine.triggerEmergencyKillSwitch(
      parsed.data.tenantId,
      parsed.data.reason
    );
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json(sanitizeHttpError(err));
  }
});

const sorMeshQuerySchema = z.object({
  algorithm: z
    .enum([
      'ALMGREN_CHRISS_OPTIMAL',
      'VOLUME_IN_LINE_VIL',
      'IMPLEMENTATION_SHORTFALL',
      'DARK_POOL_ICEBERG',
    ])
    .default('ALMGREN_CHRISS_OPTIMAL'),
  parentOrderNotionalUsd: z.coerce.number().positive().default(2500000),
});

stitchCockpitRouter.get('/sor-mesh', (req: Request, res: Response) => {
  try {
    const parsed = sorMeshQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        reason: 'Invalid SOR mesh query parameters',
        issues: parsed.error.issues,
      });
      return;
    }
    const sorMesh = cockpitEngine.getSorMeshSnapshot(
      parsed.data.algorithm,
      parsed.data.parentOrderNotionalUsd,
    );
    res.status(200).json({ ok: true, sorMesh });
  } catch (err) {
    res.status(500).json(sanitizeHttpError(err));
  }
});
