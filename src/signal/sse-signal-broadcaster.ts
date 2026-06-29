/**
 * SSE Signal Broadcaster
 * In-process Node.js EventEmitter fan-out for Server-Sent Events.
 * Rationale: this codebase runs Express on Node.js (not CF Workers),
 * so Durable Objects are unavailable. EventEmitter gives zero-dep,
 * sub-millisecond in-process fan-out; sufficient for MVP scale.
 * Reconnect is handled by SSE spec (client auto-retries on disconnect).
 */

import { EventEmitter } from 'events';
import type { Response } from 'express';
import { logger } from '../shared/utils/logger';
import type { Signal } from './signal-types';

const SSE_HEARTBEAT_MS = 20_000; // keep-alive ping every 20s

export class SseSignalBroadcaster extends EventEmitter {
  private static instance: SseSignalBroadcaster;
  /** Map of connectionId → {res, heartbeatTimer} */
  private connections: Map<string, { res: Response; heartbeat: ReturnType<typeof setInterval> }> = new Map();
  private nextId = 0;

  private constructor() {
    super();
    this.setMaxListeners(1100); // allow 1000+ SSE listeners
  }

  static getInstance(): SseSignalBroadcaster {
    if (!SseSignalBroadcaster.instance) {
      SseSignalBroadcaster.instance = new SseSignalBroadcaster();
    }
    return SseSignalBroadcaster.instance;
  }

  /** Attach an SSE response and return cleanup function */
  subscribe(res: Response): () => void {
    const id = String(++this.nextId);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send initial comment to confirm stream open
    res.write(': connected\n\n');

    const heartbeat = setInterval(() => {
      res.write(': ping\n\n');
    }, SSE_HEARTBEAT_MS);

    this.connections.set(id, { res, heartbeat });
    logger.debug(`[SSE] Client connected id=${id} total=${this.connections.size}`);

    const cleanup = () => this.unsubscribe(id);
    res.on('close', cleanup);
    return cleanup;
  }

  /** Remove an SSE connection */
  unsubscribe(id: string): void {
    const conn = this.connections.get(id);
    if (conn) {
      clearInterval(conn.heartbeat);
      this.connections.delete(id);
      logger.debug(`[SSE] Client disconnected id=${id} total=${this.connections.size}`);
    }
  }

  /** Broadcast a signal to all connected SSE clients */
  broadcast(signal: Signal): void {
    if (this.connections.size === 0) return;

    const payload = `data: ${JSON.stringify(signal)}\n\n`;
    const dead: string[] = [];

    for (const [id, { res }] of this.connections.entries()) {
      try {
        res.write(payload);
      } catch {
        dead.push(id);
      }
    }

    for (const id of dead) this.unsubscribe(id);
    logger.debug(`[SSE] Broadcast signal ${signal.id} to ${this.connections.size} clients`);
  }

  get connectionCount(): number {
    return this.connections.size;
  }
}

export const sseBroadcaster = SseSignalBroadcaster.getInstance();
