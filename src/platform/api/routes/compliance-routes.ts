/**
 * Compliance Routes — AML/KYC regulatory validation endpoints
 *
 * POST /api/compliance/validate — validate trade against all enabled rules
 * GET  /api/compliance/rules    — list all rules and their enabled status
 * PUT  /api/compliance/rules/:id/toggle — enable/disable a rule
 * GET  /api/compliance/audit    — get last 100 audit log entries
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { BUILT_IN_RULES } from '../../../desk/arbitrage/compliance/compliance-rules';
import type { ComplianceRule, ComplianceContext, ComplianceResult, AuditEntry } from '../../../desk/arbitrage/compliance/compliance-types';
import { logger } from '../../../shared/utils/logger';

export const complianceRouter: Router = Router();

// ---------------------------------------------------------------------------
// Mutable rule state (runtime toggles — in-memory for demo; D1-backed in prod)
// ---------------------------------------------------------------------------

const ruleState: Map<string, boolean> = new Map(
  BUILT_IN_RULES.map(r => [r.id, r.enabled]),
);

// ---------------------------------------------------------------------------
// Audit log (in-memory ring buffer — last 100 entries)
// ---------------------------------------------------------------------------

const MAX_AUDIT_ENTRIES = 100;
const auditLog: AuditEntry[] = [];

function appendAudit(entry: AuditEntry): void {
  if (auditLog.length >= MAX_AUDIT_ENTRIES) {
    auditLog.shift();
  }
  auditLog.push(entry);
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const validateBodySchema = z.object({
  pair: z.string().min(1),
  side: z.enum(['buy', 'sell']),
  amount: z.number().positive(),
  price: z.number().positive(),
  counterparty: z.string().min(1),
  counterpartyDailyTotal: z.number().optional(),
  recentTrades: z.array(z.object({
    action: z.enum(['buy', 'sell']),
    timestamp: z.number(),
  })).optional(),
  destinationJurisdiction: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getActiveRules(): ComplianceRule[] {
  return BUILT_IN_RULES.filter(r => ruleState.get(r.id) === true);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * POST /api/compliance/validate — validate trade against all enabled rules
 */
complianceRouter.post('/api/compliance/validate', async (req: Request, res: Response) => {
  try {
    const parsed = validateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation error', details: parsed.error.issues });
      return;
    }

    const body = parsed.data;
    const context: ComplianceContext = {
      tradeId: `TRADE-${Date.now()}`,
      asset: body.pair.split('/')[0],
      pair: body.pair,
      side: body.side,
      amount: body.amount,
      price: body.price,
      counterparty: body.counterparty,
      jurisdiction: 'US',
      timestamp: Date.now(),
      counterpartyDailyTotal: body.counterpartyDailyTotal,
      recentTrades: body.recentTrades,
      destinationJurisdiction: body.destinationJurisdiction,
    };

    const activeRules = getActiveRules();
    const results: ComplianceResult[] = [];
    let allPassed = true;

    for (const rule of activeRules) {
      const result = rule.validate(context);
      results.push(result);
      if (!result.passed) {
        allPassed = false;
        appendAudit({
          ruleId: rule.id,
          action: 'blocked',
          pair: body.pair,
          side: body.side,
          amount: body.amount,
          counterparty: body.counterparty,
          reason: result.message,
          timestamp: Date.now(),
        });
      }
    }

    res.json({
      passed: allPassed,
      ruleCount: activeRules.length,
      results,
    });
  } catch (err) {
    logger.error('[Compliance] Validate error', { err });
    res.status(500).json({ error: 'Compliance validation failed' });
  }
});

/**
 * GET /api/compliance/rules — list all rules and their enabled status
 */
complianceRouter.get('/api/compliance/rules', (_req: Request, res: Response) => {
  try {
    const rules = BUILT_IN_RULES.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      enabled: ruleState.get(r.id) ?? r.enabled,
      severity: r.severity,
    }));
    res.json({ rules });
  } catch (err) {
    logger.error('[Compliance] List rules error', { err });
    res.status(500).json({ error: 'Failed to list compliance rules' });
  }
});

/**
 * PUT /api/compliance/rules/:id/toggle — enable/disable a rule
 */
complianceRouter.put('/api/compliance/rules/:id/toggle', (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const rule = BUILT_IN_RULES.find(r => r.id === id);

    if (!rule) {
      res.status(404).json({ error: `Rule ${id} not found` });
      return;
    }

    const current = ruleState.get(id) ?? rule.enabled;
    ruleState.set(id, !current);

    logger.info('[Compliance] Rule toggled', { ruleId: id, enabled: !current });

    res.json({
      id,
      enabled: !current,
      name: rule.name,
    });
  } catch (err) {
    logger.error('[Compliance] Toggle rule error', { err });
    res.status(500).json({ error: 'Failed to toggle rule' });
  }
});

/**
 * GET /api/compliance/audit — get last 100 audit log entries
 */
complianceRouter.get('/api/compliance/audit', (_req: Request, res: Response) => {
  try {
    res.json({ entries: auditLog });
  } catch (err) {
    logger.error('[Compliance] Audit log error', { err });
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});
