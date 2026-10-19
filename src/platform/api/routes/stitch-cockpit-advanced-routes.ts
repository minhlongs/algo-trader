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
}
