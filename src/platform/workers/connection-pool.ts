/**
 * Connection Pool Manager for External APIs
 * Uses BullMQ queues for backpressure (6 connections per Worker limit)
 * NOT using Hyperdrive (database-only). Uses direct fetch with keep-alive.
 */

export interface PoolConfig {
  service: 'polymarket' | 'llm' | 'exchange';
  maxConcurrent: number; // per Worker instance (6 max total across all services)
  queueName: string;
}

export interface PoolMetrics {
  service: string;
  queuedRequests: number;
  activeRequests: number;
  completedRequests: number;
}

export class ConnectionPoolManager {
  private config: PoolConfig[];
  private queues: Map<string, any>; // BullMQ Queue instances

  constructor(config: PoolConfig[]) {
    this.config = config;
    this.queues = new Map();
  }

  /**
   * Initialize queue for a service (called during worker startup)
   */
  initQueue(service: string, queue: any): void {
    this.queues.set(service, queue);
  }

  /**
   * Enqueue a request to be processed by queue consumers
   * Returns a promise that resolves with the API response
   */
  async enqueueRequest(service: string, url: string, options: RequestInit = {}): Promise<Response> {
    const queue = this.queues.get(service);
    if (!queue) {
      throw new Error(`No queue configured for service: ${service}`);
    }

    // Add to queue with priority (if provided)
    const job = await queue.add('api-request', {
      url,
      method: options.method || 'GET',
      headers: options.headers,
      body: options.body,
    });

    // Wait for job completion (result is the Response JSON)
    const result = await job.finished();
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Get metrics for all queues
   */
  getMetrics(): PoolMetrics[] {
    const metrics: PoolMetrics[] = [];
    for (const config of this.config) {
      const queue = this.queues.get(config.service);
      metrics.push({
        service: config.service,
        queuedRequests: queue?.getWaitingCount() || 0,
        activeRequests: queue?.getActiveCount() || 0,
        completedRequests: queue?.getCompletedCount() || 0,
      });
    }
    return metrics;
  }

  /**
   * Check if queue exists
   */
  hasQueue(service: string): boolean {
    return this.queues.has(service);
  }
}

// Singleton instance
let globalPoolManager: ConnectionPoolManager | null = null;

export function getConnectionPoolManager(): ConnectionPoolManager {
  if (!globalPoolManager) {
    globalPoolManager = new ConnectionPoolManager([
      { service: 'polymarket', maxConcurrent: 6, queueName: 'polymarket-queue' },
      { service: 'llm', maxConcurrent: 6, queueName: 'llm-queue' },
      { service: 'exchange', maxConcurrent: 6, queueName: 'exchange-queue' },
    ]);
  }
  return globalPoolManager;
}
