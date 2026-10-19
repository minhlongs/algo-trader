// SPDX-License-Identifier: MIT
/**
 * Advanced Stitch Cockpit routes (#17–#18), extracted to keep the main router
 * under the 159-LOC quality ceiling.
 */

import type { Router, Request, Response } from 'express';
import type { StitchUiCockpitEngine } from '../../../desk/opencoresaas2026monetization/stitch-ui-cockpit';
import { sanitizeHttpError } from '../../../shared/utils/error-sanitize';
import {
  avellanedaLipkinQuerySchema,
  blackLittermanRiskParityQuerySchema,
  liquidityImpactQuerySchema,
  statarbGlostenMilgromQuerySchema,
} from './stitch-cockpit-schemas';

export function registerAdvancedCockpitRoutes(router: Router, engine: StitchUiCockpitEngine): void {
  router.get('/avellaneda-lipkin', (req: Request, res: Response) => {
    try {
      const parsed = avellanedaLipkinQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ ok: false, reason: 'Invalid avellaneda-lipkin query parameters', issues: parsed.error.issues });
        return;
      }
      const avellanedaLipkin = engine.getAvellanedaLipkinSnapshot(
        parsed.data.inventoryUnits,
        parsed.data.riskAversionGamma,
        parsed.data.volatilitySigma,
        parsed.data.midPrice,
      );
      res.status(200).json({ ok: true, avellanedaLipkin });
    } catch (err) {
      res.status(500).json(sanitizeHttpError(err));
    }
  });

  router.get('/statarb-glosten-milgrom', (req: Request, res: Response) => {
    try {
      const parsed = statarbGlostenMilgromQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ ok: false, reason: 'Invalid statarb-glosten-milgrom query parameters', issues: parsed.error.issues });
        return;
      }
      const statarbGlostenMilgrom = engine.getStatArbGlostenMilgromSnapshot(
        parsed.data.informedTraderShareAlpha,
        parsed.data.priorProbHighMu,
      );
      res.status(200).json({ ok: true, statarbGlostenMilgrom });
    } catch (err) {
      res.status(500).json(sanitizeHttpError(err));
    }
  });

  router.get('/liquidity-impact', (req: Request, res: Response) => {
    try {
      const parsed = liquidityImpactQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ ok: false, reason: 'Invalid liquidity-impact query parameters', issues: parsed.error.issues });
        return;
      }
      const liquidityImpact = engine.getLiquidityImpactSnapshot(parsed.data.totalShares, parsed.data.riskAversion);
      res.status(200).json({ ok: true, liquidityImpact });
    } catch (err) {
      res.status(500).json(sanitizeHttpError(err));
    }
  });

  router.get('/black-litterman-risk-parity', (req: Request, res: Response) => {
    try {
      const parsed = blackLittermanRiskParityQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ ok: false, reason: 'Invalid black-litterman-risk-parity query parameters', issues: parsed.error.issues });
        return;
      }
      const blackLittermanRiskParity = engine.getBlackLittermanRiskParitySnapshot(
        parsed.data.riskAversionLambda,
        parsed.data.tau,
      );
      res.status(200).json({ ok: true, blackLittermanRiskParity });
    } catch (err) {
      res.status(500).json(sanitizeHttpError(err));
    }
  });
}
