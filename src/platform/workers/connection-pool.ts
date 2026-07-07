/**
 * Connection Pool Manager for External APIs
 * Supports both pool-based and legacy queue-based APIs.
 */

export interface PoolConfig {
  service: string;
  maxConnections: number;
  maxIdle: number;
  ttl: number;
}

export interface PoolMetrics {
  service: string;
  activeConnections: number;
  idleConnections: number;
  waitQueueLength: number;
}

export class ConnectionPoolManager {
  private config: PoolConfig[];
  private pools: Map<string, { active: number; idle: number; lastUsed: number }>;

  constructor(config: PoolConfig[]) {
    this.config = config;
    this.pools = new Map();
  }

  /** Initialize pool for a service */
  initPool(service: string, transport: { fetch: typeof fetch }): void {
    this.pools.set(service, { active: 0, idle: 0, lastUsed: Date.now() });
    this._transport = this._transport || new Map<string, { fetch: typeof fetch; _legacyQueue?: any }>();
    (this._transport as any).set(service, transport);
  }

  private _transport: Map<string, { fetch: typeof fetch; _legacyQueue?: any }> | null = null;

  /** Check if pool exists for a service */
  hasPool(service: string): boolean {
    return this.pools.has(service);
  }

  /** Execute fetch through the pool */
  async fetchWithPool(
    service: string,
    url: string,
    options?: RequestInit
  ): Promise<Response> {
    const transport = this._transport?.get(service);
    if (!transport) {
      throw new Error(
        `No pool configured for service: ${service}. Call initPool() first.`
      );
    }
    const pool = this.pools.get(service);
    if (pool && pool.idle > 0) {
      pool.idle--;
      pool.active++;
    }
    try {
      const response = await transport.fetch(url, options);
      // If using a legacy BullMQ-style queue, return its result shape
      if (response && typeof (response as any).finished === 'function') {
        return response as unknown as Response;
      }
      return response;
    } finally {
      if (pool) {
        pool.active--;
        pool.idle++;
        pool.lastUsed = Date.now();
      }
    }
  }

  /** Get metrics for all pools */
  getMetrics(): PoolMetrics[] {
    const metrics: PoolMetrics[] = [];
    for (const cfg of this.config) {
      const pool = this.pools.get(cfg.service);
      metrics.push({
        service: cfg.service,
        activeConnections: pool?.active || 0,
        idleConnections: pool?.idle || 0,
        waitQueueLength: 0,
      });
    }
    return metrics;
  }

  // ── Legacy Queue API (BullMQ-style) ────────────────────────────────────

  /** Register a BullMQ-style queue for a service (legacy alias) */
  initQueue(service: string, queue: any): void {
    // Store the queue so enqueueRequest can find it
    this._transport = this._transport || new Map<string, { fetch: typeof fetch; _legacyQueue?: any }>();
    const entry = this._transport.get(service);
    if (entry) {
      entry._legacyQueue = queue;
    } else {
      this._transport.set(service, { fetch: async () => new Response() as any, _legacyQueue: queue });
    }
    if (!this.pools.has(service)) {
      this.pools.set(service, { active: 0, idle: 1, lastUsed: Date.now() });
    }
  }

  /** Check if a queue is registered (legacy alias for hasPool) */
  hasQueue(service: string): boolean {
    const entry = this._transport?.get(service);
    return !!entry?._legacyQueue;
  }

  /** Enqueue a request via the registered BullMQ-style queue */
  async enqueueRequest(
    service: string,
    url: string,
    options?: RequestInit
  ): Promise<{ finished: () => Promise<{ data: string }> }> {
    const entry = this._transport?.get(service);
    const queue = entry?._legacyQueue;
    if (!queue) {
      throw new Error(`No queue configured for service: ${service}. Call initQueue() first.`);
    }
    const result = await queue.add(url, options);
    return {
      finished: async () => {
        const data = await result.finished();
        return { data: (data as any)?.data || 'ok' };
      },
    };
  }
}

// Singleton
let globalPoolManager: ConnectionPoolManager | null = null;

export function getConnectionPoolManager(): ConnectionPoolManager {
  if (!globalPoolManager) {
    globalPoolManager = new ConnectionPoolManager([
      { service: 'polymarket', maxConnections: 6, maxIdle: 3, ttl: 30 },
      { service: 'llm', maxConnections: 6, maxIdle: 3, ttl: 60 },
      { service: 'exchange', maxConnections: 6, maxIdle: 3, ttl: 30 },
    ]);
  }
  return globalPoolManager;
}
