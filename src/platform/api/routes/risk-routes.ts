/**
 * Risk API Routes — /api/v1/risk/*
 *
 * Exposes portfolio and trading risk metrics via REST endpoints:
 *   POST   /api/v1/risk/var              — VaR/CVaR computation
 *   POST   /api/v1/risk/correlation      — Correlation matrix
 *   GET    /api/v1/risk/drawdown         — Drawdown status + alerts
 *   POST   /api/v1/risk/drawdown/alert   — Trigger drawdown alert check
 *   POST   /api/v1/risk/atr/stop         — ATR trailing stop computation
 *   GET    /api/v1/risk/atr/stop/:symbol — Get stored ATR state
 *   DELETE /api/v1/risk/atr/stop/:symbol — Clear ATR state (position close)
 *   POST   /api/v1/risk/kelly/size       — Kelly position sizing
 *   POST   /api/v1/risk/kelly/from-history — Kelly from trade history
 *   DELETE /api/v1/risk/cache           — Invalidate user risk cache
 */

import { Router } from 'express';
import { RiskEngine } from '../../risk/risk-engine';
import { registerPortfolioRoutes } from './risk-routes-portfolio';
import { registerTradingRoutes } from './risk-routes-trading';

export const riskRouter: Router = Router();

const riskEngine = new RiskEngine();
registerPortfolioRoutes(riskRouter, riskEngine);
registerTradingRoutes(riskRouter, riskEngine);

export {
  positionSchema,
  varRequestSchema,
  correlationRequestSchema,
  drawdownAlertSchema,
  atrStopSchema,
  kellySchema,
  kellyHistorySchema,
} from './risk-routes-schemas';
export { checkEnabled, getUserId } from './risk-routes-common';
export { registerPortfolioRoutes } from './risk-routes-portfolio';
export { registerTradingRoutes } from './risk-routes-trading';
