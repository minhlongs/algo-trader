/**
 * RUM (Real User Monitoring) Collector
 * Collects client-side performance metrics and sends to backend
 */

export interface RUMMetric {
  name: 'navigation' | 'api_call' | 'ws_message' | 'resource';
  duration: number;
  startTime?: number;
  type?: string;
  url?: string;
  timestamp: number;
}

export class RUMCollector {
  private metrics: RUMMetric[] = [];
  private sessionId: string;
  private userId?: string;
  private endpoint: string;
  private flushInterval: number;
  private flushTimer?: ReturnType<typeof setInterval>;
  private sampleRate: number;

  constructor(options: { endpoint?: string; sampleRate?: number; userId?: string } = {}) {
    this.endpoint = options.endpoint || '/api/rum/ingest';
    this.sampleRate = options.sampleRate ?? 0.1; // 10% by default
    this.sessionId = this.generateSessionId();
    this.userId = options.userId;
    this.flushInterval = 10000; // 10s

    this.setupNavigationTiming();
    this.setupResourceTiming();
    this.setupWebSocketTiming();
    this.startAutoFlush();
  }

  private generateSessionId(): string {
    return 'session_' + Math.random().toString(36).substring(2, 15);
  }

  private shouldSample(): boolean {
    return Math.random() < this.sampleRate;
  }

  private setupNavigationTiming(): void {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (this.shouldSample()) {
            this.metrics.push({
              name: 'navigation',
              duration: entry.duration,
              startTime: entry.startTime,
              type: entry.name,
              timestamp: Date.now(),
            });
          }
        }
      });
      observer.observe({ entryTypes: ['navigation'] });
    } catch (e) {
      // Ignore if observer not supported
    }
  }

  private setupResourceTiming(): void {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest') {
            if (this.shouldSample()) {
              this.metrics.push({
                name: 'api_call',
                duration: entry.duration,
                url: entry.name,
                timestamp: Date.now(),
              });
            }
          }
        }
      });
      observer.observe({ entryTypes: ['resource'] });
    } catch (e) {
      // Ignore
    }
  }

  private setupWebSocketTiming(): void {
    if (typeof window === 'undefined') return;

    // Listen for custom ws-message events with latency data
    window.addEventListener('ws-message', (event: Event) => {
      const custom = event as CustomEvent;
      if (this.shouldSample() && custom.detail?.latency) {
        this.metrics.push({
          name: 'ws_message',
          duration: custom.detail.latency,
          timestamp: Date.now(),
        });
      }
    });
  }

  private startAutoFlush(): void {
    if (typeof window === 'undefined') return;
    this.flushTimer = setInterval(() => this.flush(), this.flushInterval);
  }

  /**
   * Manually flush metrics to backend
   */
  async flush(): Promise<void> {
    if (this.metrics.length === 0) return;

    const payload = {
      sessionId: this.sessionId,
      userId: this.userId,
      sampleRate: this.sampleRate,
      metrics: this.metrics,
      timestamp: Date.now(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    };

    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true, // Ensure request completes even if page unloads
      });
      this.metrics = []; // Clear on success
    } catch (error) {
      // Silently fail - RUM is best-effort
      console.warn('RUM flush failed:', error);
    }
  }

  /**
   * Add a custom metric manually
   */
  addMetric(metric: Omit<RUMMetric, 'timestamp'>): void {
    if (this.shouldSample()) {
      this.metrics.push({
        ...metric,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Destroy collector and flush remaining metrics
   */
  async destroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    await this.flush();
  }
}

/**
 * Create a global RUM collector instance
 */
let globalRUMCollector: RUMCollector | null = null;

export function getRUMCollector(): RUMCollector {
  if (!globalRUMCollector && typeof window !== 'undefined') {
    globalRUMCollector = new RUMCollector();
  }
  return globalRUMCollector!;
}
