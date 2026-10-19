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
  type IDeskStatusDataProvider,
  DeskStatusServerConfigSchema,
} from './desk-status-server-types';
import {
  sendStatusJson,
  buildDefaultDeskStatus,
  buildDefaultDeskAllocations,
} from './desk-status-defaults';

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
      if (method !== 'GET') throw new Error('Resource not found');

      if (pathname === '/health') {
        sendStatusJson(res, 200, {
          status: 'ok',
          uptimeSeconds: this.getUptimeSeconds(),
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (pathname === '/status') {
        const data = this.dataProvider?.getStatus
          ? await this.dataProvider.getStatus()
          : buildDefaultDeskStatus(this.running, this.getUptimeSeconds());
        sendStatusJson(res, 200, data);
        return;
      }

      if (pathname === '/api/desk/allocations') {
        const data = this.dataProvider?.getAllocations
          ? await this.dataProvider.getAllocations()
          : buildDefaultDeskAllocations();
        sendStatusJson(res, 200, data);
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
      sendStatusJson(res, sanitized.error.statusCode, sanitized);
    }
  }
}
