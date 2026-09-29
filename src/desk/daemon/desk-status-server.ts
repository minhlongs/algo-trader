/**
 * Desk Status Server — Embedded HTTP Telemetry & Status Server
 * Milestone M4: Telemetry & HTTP Status Server
 */

import { createServer as createHttpServer } from 'node:http';
import type { Server, IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { logger } from '../../shared/utils/logger';
import { sanitizeHttpError } from '../../shared/utils/error-sanitize';
import { DeskMetricsRegistry } from '../telemetry/desk-metrics-registry';
import {
  type DeskStatusServerOptions,
  type DeskStatusResponse,
  type DeskAllocationsResponse,
  type IDeskStatusDataProvider,
  DeskStatusServerConfigSchema,
} from './desk-status-server-types';

export class DeskStatusServer {
  public readonly metricsRegistry: DeskMetricsRegistry;
  private readonly host: string;
  private readonly configuredPort: number;
  private readonly dataProvider?: IDeskStatusDataProvider;
  private server: Server | null = null;
  private actualPort = 0;
  private startedAt = 0;
  private running = false;

  constructor(options: DeskStatusServerOptions = {}) {
    const validated = DeskStatusServerConfigSchema.parse({
      port: options.port ?? 9100,
      host: options.host ?? '127.0.0.1',
    });
    this.configuredPort = validated.port;
    this.host = validated.host;
    this.dataProvider = options.dataProvider;
    this.metricsRegistry = options.metricsRegistry ?? new DeskMetricsRegistry();
  }

  public async start(): Promise<void> {
    if (this.running) return;
    this.startedAt = Date.now();

    await new Promise<void>((resolve, reject) => {
      this.server = createHttpServer((req, res) => {
        void this.handleRequest(req, res);
      });

      this.server.once('error', (err) => {
        logger.error('[DeskStatusServer] Failed to start HTTP server', err);
        reject(err);
      });

      this.server.listen(this.configuredPort, this.host, () => {
        const addr = this.server?.address() as AddressInfo | null;
        this.actualPort = addr?.port ?? this.configuredPort;
        this.running = true;
        logger.info(`[DeskStatusServer] Status server listening at http://${this.host}:${this.actualPort}`);
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    if (!this.running || !this.server) return;
    this.running = false;
    const s = this.server;
    this.server = null;
    await new Promise<void>((resolve, reject) => {
      s.close((err) => {
        if (err && (err as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING' && !err.message.includes('not running')) {
          logger.error('[DeskStatusServer] Error stopping status server', err);
          reject(err);
        } else {
          logger.info('[DeskStatusServer] Status server stopped gracefully');
          resolve();
        }
      });
    });
  }

  public getPort(): number { return this.actualPort; }
  public getHost(): string { return this.host; }
  public getUrl(): string { return `http://${this.host}:${this.actualPort}`; }
  public isRunning(): boolean { return this.running; }
  public getUptimeSeconds(): number {
    if (this.dataProvider?.getUptimeSeconds) return this.dataProvider.getUptimeSeconds();
    return this.running ? Math.floor((Date.now() - this.startedAt) / 1000) : 0;
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method?.toUpperCase() ?? 'GET';
    const rawUrl = req.url ?? '/';
    const pathname = rawUrl.split('?')[0].replace(/\/+$/, '') || '/';

    if (method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' });
      res.end();
      return;
    }

    try {
      if (method !== 'GET') {
        throw new Error('Resource not found');
      }

      if (pathname === '/health') {
        this.sendJson(res, 200, {
          status: 'ok',
          uptimeSeconds: this.getUptimeSeconds(),
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (pathname === '/status') {
        const data = this.dataProvider?.getStatus ? await this.dataProvider.getStatus() : this.getDefaultStatus();
        this.sendJson(res, 200, data);
        return;
      }

      if (pathname === '/api/desk/allocations') {
        const data = this.dataProvider?.getAllocations
          ? await this.dataProvider.getAllocations()
          : this.getDefaultAllocations();
        this.sendJson(res, 200, data);
        return;
      }

      if (pathname === '/metrics') {
        const metrics = this.dataProvider?.getMetricsText
          ? await this.dataProvider.getMetricsText()
          : await this.metricsRegistry.getMetricsText();
        res.writeHead(200, {
          'Content-Type': this.metricsRegistry.getContentType(),
          'Content-Length': Buffer.byteLength(metrics),
        });
        res.end(metrics);
        return;
      }

      throw new Error('Resource not found');
    } catch (err) {
      const sanitized = sanitizeHttpError(err);
      this.sendJson(res, sanitized.error.statusCode, sanitized);
    }
  }

  private sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
    const payload = JSON.stringify(data);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
  }

  private getDefaultStatus(): DeskStatusResponse {
    return {
      status: this.running ? 'RUNNING' : 'STOPPED',
      mode: 'PAPER',
      circuitBreakerTier: 'NORMAL',
      navUsd: 0,
      driftUsd: 0,
      engines: {
        arbitrage: { status: 'STOPPED', allocatedCapitalUsd: 0 },
        marl: { status: 'STOPPED', allocatedCapitalUsd: 0 },
        amm: { status: 'STOPPED', allocatedCapitalUsd: 0 },
        'alpha-lab': { status: 'STOPPED', allocatedCapitalUsd: 0 },
      },
      uptimeSeconds: this.getUptimeSeconds(),
      cycleCount: 0,
    };
  }

  private getDefaultAllocations(): DeskAllocationsResponse {
    const allocations = { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 };
    return {
      totalNavUsd: 0,
      unallocatedCashUsd: 0,
      cashBufferRatio: 1.0,
      allocations,
      allocatedCapitalUsd: allocations,
      driftUsd: 0,
      isZeroDrift: true,
    };
  }
}
