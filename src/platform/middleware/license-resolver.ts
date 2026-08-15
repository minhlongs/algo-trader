import { Request, Response, NextFunction } from 'express';
import RaasGate from '../../desk/gate/raas-gate';

/**
 * License resolver middleware — populates `req.license` from the
 * `Authorization: Bearer <api-key>` header using the RaaS gate.
 *
 * feature-gate's `requireTier()` reads `req.license`, which this middleware
 * attaches so tier-gated routes (signals ingest/feed, revenue, PnL, kyc)
 * are satisfiable. Requests without a valid key leave `req.license`
 * undefined; `requireTier` then returns 401, preserving the fail-closed
 * posture for non-licensed callers.
 */
export function resolveLicense(req: Request, _res: Response, next: NextFunction): void {
	const authHeader = req.headers.authorization ?? '';
	const apiKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
	if (apiKey) {
		req.license = RaasGate.getInstance().validateApiKey(apiKey);
	}
	next();
}
