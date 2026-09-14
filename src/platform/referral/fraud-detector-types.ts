/**
 * Types and defaults for Referral Click Fraud Detection.
 */

export interface FraudDetectionConfig {
  maxClicksPerIpPerDay: number;
  maxClicksPerUserAgentPerDay: number;
  suspiciousUserAgents: string[];
  fraudThreshold: number; // 0-100 score threshold
}

export const DEFAULT_FRAUD_CONFIG: FraudDetectionConfig = {
  maxClicksPerIpPerDay: 100,
  maxClicksPerUserAgentPerDay: 50,
  suspiciousUserAgents: [
    'HeadlessChrome',
    'PhantomJS',
    'Selenium',
    'Puppeteer',
    'curl',
    'wget',
  ],
  fraudThreshold: 70,
};

export interface FraudDetectionResult {
  score: number;
  reasons: string[];
  isBlocked: boolean;
}

export interface BatchAnalyzeResult {
  analyzed: number;
  flagged: number;
  averageScore: number;
}
