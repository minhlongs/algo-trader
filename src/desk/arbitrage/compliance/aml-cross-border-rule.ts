import type { ComplianceRule, ComplianceContext, ComplianceResult } from './compliance-types';

export const HIGH_RISK_JURISDICTIONS = new Set([
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
