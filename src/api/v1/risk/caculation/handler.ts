// ──────────────────────────────────────────────────────────────────────────────
// handler.ts — Express route registration for /api/v1/risk/caculation
//
// Contract:
// - RightsGuard applied ONCE at top
// - Controller handles the rest (no additional auth middleware)
// - No RatsGuard re-runs — identity flows through req.ratIdentifier
// ──────────────────────────────────────────────────────────────────────────────

import type { Router, Request, Response } from 'express';
import type { RiskCalculationController } from './controller';
import type { RiskCalculationRepository } from './repository';
import type { LimitEnforcerService } from './limit-enforcer';
import { RightsGuard } from './middleware/rightsGuard';

// ── Route factory (dependency injection — testable without Express) ───────────

export interface RiskCalculationRouteOptions {
  readonly router: Router;
  readonly controller: RiskCalculationController;
  readonly rateLimiter?: LimitEnforcerService; // optional rate limit per rat
}

export function registerRiskCalculationRoute(opts: RiskCalculationRouteOptions): void {
  const { router, controller } = opts;

  // Pin 3: RightsGuard is the ONLY auth middleware in this route.
  // It runs once, attaches identity, then short-circuits.
  router.get(
    '/risk/caculation',
    RightsGuard,
    async (req: Request, res: Response): Promise<void> => {
      await controller.handle(req, res);
    }
  );
}

// ── Wire-up helper (for app.ts / server.ts integration) ───────────────────────

export interface WireUpOptions {
  readonly router: Router;
  readonly repository: RiskCalculationRepository;
  readonly rateLimiter?: LimitEnforcerService;
}

export function wireUpRiskCalculation(opts: WireUpOptions): void {
  // Lazy import to keep this module tree-shakeable
  const { RiskCalculationController } = require('./controller');
  const { RiskCalculationService } = require('./service');
  const { RiskCalculationRepository } = require('./repository');

  const service = new RiskCalculationService({ repository: opts.repository });
  const controller = new RiskCalculationController({ service, repository: opts.repository });

  registerRiskCalculationRoute({ router: opts.router, controller, rateLimiter: opts.rateLimiter });
}
