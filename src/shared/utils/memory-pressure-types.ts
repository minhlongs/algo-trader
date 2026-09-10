/**
 * Memory Pressure Types and Interfaces
 */

export interface MemoryMetrics {
  rss: number; // Resident set size
  heapUsed: number;
  heapTotal: number;
  external: number;
  limit: number; // 128MB for Cloudflare Workers
}

// Non-standard V8/Workers memory API
export interface PerformanceMemory {
  rss: number;
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  external: number;
}

export interface MemoryPressureConfig {
  warningThresholdMb: number; // 100MB default
  criticalThresholdMb: number; // 115MB default
  checkIntervalMs: number; // 5000ms default
  autoCleanup: boolean;
  onCritical?: () => Promise<void>;
}

export type PressureLevel = 'normal' | 'warning' | 'critical';

export const DEFAULT_MEMORY_LIMIT_BYTES = 128 * 1024 * 1024;

export const DEFAULT_MEMORY_PRESSURE_CONFIG: Omit<MemoryPressureConfig, 'onCritical'> = {
  warningThresholdMb: 100,
  criticalThresholdMb: 115,
  checkIntervalMs: 5000,
  autoCleanup: true,
};

export function evaluatePressureLevel(
  rssBytes: number,
  warningMb: number,
  criticalMb: number,
): PressureLevel {
  const rssMb = rssBytes / 1024 / 1024;
  if (rssMb >= criticalMb) return 'critical';
  if (rssMb >= warningMb) return 'warning';
  return 'normal';
}
