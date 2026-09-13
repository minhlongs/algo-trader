export interface RegionMetrics {
  region: string;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  healthy: boolean;
  lastCheck: number;
  errorRate: number;
}

export interface ProbeResult {
  region: string;
  target: string;
  latencyMs: number;
  status: 'success' | 'failure';
  error?: string;
  timestamp: number;
}

export interface LatencyMonitorOptions {
  targetUrl?: (region: string) => string;
  probeInterval?: number;
  alertThresholdP95?: number;
  onAlert?: (region: string, p95: number) => void;
}
