export interface ShardNodeData {
  id: number;
  status: 'healthy' | 'degraded' | 'offline';
  rps: number;
  latencyMs: number;
  strategyCount: number;
  virtualNodes: number;
}

export interface ShardTelemetryPoint {
  time: string;
  value: number;
}
