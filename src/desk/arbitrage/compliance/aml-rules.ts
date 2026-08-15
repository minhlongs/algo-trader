/**
 * AML Compliance Rules
 *
 * Anti-Money Laundering rules for regulatory compliance.
 * US FinCEN thresholds and FATF high-risk jurisdictions.
 */

import type { ComplianceRule, ComplianceContext, ComplianceResult } from './compliance-types';
import { logger } from '../../../shared/utils/logger';

// ---------------------------------------------------------------------------
// AML-001: Transaction Amount Limit (US $10,000 CTR threshold)
// ---------------------------------------------------------------------------
export const AML_TRANSACTION_LIMIT: ComplianceRule = {
  id: 'AML-001',
  name: 'Transaction Amount Limit',
  description: 'Blocks trades exceeding $10,000 per US FinCEN CTR threshold',
  enabled: true,
  severity: 'critical',
  validate: (context: ComplianceContext): ComplianceResult => {
    const tradeValue = context.amount * context.price;
    const THRESHOLD = 10_000;

    if (tradeValue > THRESHOLD) {
      return {
        passed: false,
        ruleId: 'AML-001',
        message: `Trade value $${tradeValue} exceeds AML threshold $${THRESHOLD}`,
        severity: 'critical',
        timestamp: Date.now(),
      };
    }
    return {
      passed: true,
      ruleId: 'AML-001',
      message: 'Transaction amount within AML limit',
      severity: 'critical',
      timestamp: Date.now(),
    };
  },
};

// ---------------------------------------------------------------------------
// AML-002: Daily Volume Velocity — same counterparty > $50,000 in 24h
// ---------------------------------------------------------------------------
export const AML_DAILY_VELOCITY: ComplianceRule = {
  id: 'AML-002',
  name: 'Daily Volume Velocity',
  description: 'Blocks trades when same counterparty exceeds $50,000 in 24 hours',
  enabled: true,
  severity: 'high',
  validate: (context: ComplianceContext): ComplianceResult => {
    const DAILY_LIMIT = 50_000;
    const counterpartyTotal = context.counterpartyDailyTotal;

    if (counterpartyTotal !== undefined && counterpartyTotal + (context.amount * context.price) > DAILY_LIMIT) {
      return {
        passed: false,
        ruleId: 'AML-002',
        message: `Counterparty 24h volume $${counterpartyTotal + (context.amount * context.price)} exceeds $${DAILY_LIMIT}`,
        severity: 'high',
        timestamp: Date.now(),
      };
    }
    return {
      passed: true,
      ruleId: 'AML-002',
      message: 'Daily velocity check passed',
      severity: 'high',
      timestamp: Date.now(),
    };
  },
};

// ---------------------------------------------------------------------------
// AML-003: Suspicious Pattern — rapid buy-sell-sell-buy cycles (< 60s)
// ---------------------------------------------------------------------------
const RAPID_CYCLE_WINDOW_MS = 60_000;

export const AML_SUSPICIOUS_PATTERN: ComplianceRule = {
  id: 'AML-003',
  name: 'Suspicious Trade Pattern',
  description: 'Flags rapid buy-sell-sell-buy cycles within 60 seconds',
  enabled: true,
  severity: 'high',
  validate: (context: ComplianceContext): ComplianceResult => {
    const recentTrades = context.recentTrades;

    if (recentTrades && recentTrades.length >= 3) {
      const now = context.timestamp;
      const recent = recentTrades.filter(t => now - t.timestamp < RAPID_CYCLE_WINDOW_MS);
      const sequence = recent.map(t => t.action).join(',');

      if (/buy,sell,sell|sell,buy,buy|sell,buy,sell|buy,sell,buy/i.test(sequence)) {
        return {
          passed: false,
          ruleId: 'AML-003',
          message: `Suspicious rapid trade cycle detected: [${sequence}] within 60s`,
          severity: 'high',
          timestamp: Date.now(),
        };
      }
    }
    return {
      passed: true,
      ruleId: 'AML-003',
      message: 'No suspicious pattern detected',
      severity: 'high',
      timestamp: Date.now(),
    };
  },
};

// ---------------------------------------------------------------------------
// AML-004: OFAC Sanctions Screening (config-driven, lazy-loaded)
// ---------------------------------------------------------------------------
function parseOfacSanctionsList(): Set<string> {
  return new Set(
    (process.env.OFAC_SANCTIONS_ADDRESSES ?? '')
      .split(',')
      .map((addr: string) => addr.trim().toLowerCase())
      .filter(Boolean),
  );
}

export const AML_OFAC_SANCTIONS: ComplianceRule = {
  id: 'AML-004',
  name: 'OFAC Sanctions Screening',
  description: 'Checks counterparty against OFAC SDN list (config-driven via OFAC_SANCTIONS_ADDRESSES env var)',
  enabled: true,
  severity: 'critical',
  validate: (context: ComplianceContext): ComplianceResult => {
    const sanctionsList = parseOfacSanctionsList();

    if (sanctionsList.size === 0) {
      logger.warn('OFAC sanctions list is empty — screening disabled (fail-open). Set OFAC_SANCTIONS_ADDRESSES env var to enable.');
      return {
        passed: true,
        ruleId: 'AML-004',
        message: 'OFAC screening skipped — sanctions list is empty (fail-open)',
        severity: 'critical',
        timestamp: Date.now(),
      };
    }

    if (sanctionsList.has(context.counterparty.toLowerCase())) {
      return {
        passed: false,
        ruleId: 'AML-004',
        message: `Counterparty ${context.counterparty} found on OFAC SDN list`,
        severity: 'critical',
        timestamp: Date.now(),
      };
    }
    return {
      passed: true,
      ruleId: 'AML-004',
      message: 'OFAC sanctions screening passed',
      severity: 'critical',
      timestamp: Date.now(),
    };
  },
};

// ---------------------------------------------------------------------------
// AML-005: Cross-Border Transfer to High-Risk Jurisdictions
// ---------------------------------------------------------------------------
const HIGH_RISK_JURISDICTIONS = new Set([
  'AF', 'MM', 'KH', 'CD', 'HT',
  'IR', 'IQ', 'LB', 'LY', 'SO',
  'SS', 'SD', 'SY', 'VE', 'YE',
]);

export const AML_CROSS_BORDER: ComplianceRule = {
  id: 'AML-005',
  name: 'Cross-Border Transfer Flag',
  description: 'Flags transfers to FATF high-risk jurisdictions',
  enabled: true,
  severity: 'high',
  validate: (context: ComplianceContext): ComplianceResult => {
    const destination = context.destinationJurisdiction;

    if (destination && HIGH_RISK_JURISDICTIONS.has(destination.toUpperCase())) {
      return {
        passed: false,
        ruleId: 'AML-005',
        message: `Transfer to high-risk jurisdiction ${destination.toUpperCase()} flagged`,
        severity: 'high',
        timestamp: Date.now(),
      };
    }
    return {
      passed: true,
      ruleId: 'AML-005',
      message: 'Cross-border check passed',
      severity: 'high',
      timestamp: Date.now(),
    };
  },
};
