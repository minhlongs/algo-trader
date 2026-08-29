/**
 * Referral API Routes (facade)
 * Endpoints for referral program management
 * Handlers live in referral-routes-admin / referral-routes-public / referral-routes-commissions
 */

import { Router } from 'express';
import { requireTier } from '../../middleware/feature-gate';
import { handleGetStats, handleGetCode, handleGenerateCode } from './referral-routes-admin';
import { handleTrackClick, handleValidate } from './referral-routes-public';
import {
  handleGetCommissions,
  handleGetPayouts,
  handleGetMyCode,
  handleGetClicks,
} from './referral-routes-commissions';

export const referralRouter: Router = Router();

referralRouter.get('/stats', requireTier('ENTERPRISE'), handleGetStats);
referralRouter.get('/code', requireTier('ENTERPRISE'), handleGetCode);
referralRouter.post('/generate-code', requireTier('ENTERPRISE'), handleGenerateCode);
referralRouter.post('/track-click', requireTier('ENTERPRISE'), handleTrackClick);
referralRouter.get('/commissions', requireTier('ENTERPRISE'), handleGetCommissions);
referralRouter.get('/payouts', requireTier('ENTERPRISE'), handleGetPayouts);
referralRouter.post('/validate', requireTier('ENTERPRISE'), handleValidate);
referralRouter.get('/my-code', requireTier('ENTERPRISE'), handleGetMyCode);
referralRouter.get('/clicks/:code', requireTier('ENTERPRISE'), handleGetClicks);

export default referralRouter;
