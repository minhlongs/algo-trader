export interface RegionStatus {
  region: string;
  healthy: boolean;
  latencyMs: number;
  errorRate: number;
  lastCheck: number;
  consecutiveFailures: number;
}

export interface FailoverConfig {
  checkInterval: number; // ms
  failoverThreshold: number; // consecutive failures before failover
  recoveryGracePeriod: number; // ms to wait before marking recovered
  healthEndpoint: string;
}

export const DEFAULT_REGION_CONFIG: FailoverConfig = {
  checkInterval: 30000,
  failoverThreshold: 3,
  recoveryGracePeriod: 60000,
  healthEndpoint: '/api/health/region',
};
