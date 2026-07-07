// ── Package type stubs for packages without @types ──────────────────────────
// These are global declarations; actual packages may be installed or stubbed at runtime.

declare module 'lodash' {
  export function get(obj: unknown, path: string, def?: unknown): unknown;
  export function set(obj: unknown, path: string, val: unknown): unknown;
  export function cloneDeep<T>(val: T): T;
  export function pick<T>(obj: T, ...paths: string[]): Partial<T>;
  export function omit<T>(obj: T, ...keys: string[]): Omit<T, string>;
  export function merge<T>(target: T, source: Partial<T>): T;
  export function isNil(val: unknown): boolean;
  export function isEmpty(val: unknown): boolean;
  export function debounce<F extends (...args: unknown[]) => void>(fn: F, wait: number): F;
  export function throttle<F extends (...args: unknown[]) => void>(fn: F, wait: number): F;
  export function chunk<T>(arr: T[], size: number): T[][];
  export function flatten<T>(arr: unknown[]): T[];
  export function uniq<T>(arr: T[]): T[];
  export function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]>;
  export function sortBy<T>(arr: T[], ...iters: ((x: T) => unknown)[]): T[];
}

declare module '@polymarket/clob-client' {
  export class ClobClient {
    constructor(host: string, chainId: number, ...args: unknown[]);
    getOrderBook(tokenId: string): Promise<unknown>;
    getPrice(tokenId: string, side: string): Promise<unknown>;
    getMidpoint(tokenId: string): Promise<unknown>;
    getOpenOrders(params?: Record<string, unknown>): Promise<unknown[]>;
    cancelOrder(params: Record<string, unknown>): Promise<void>;
  }
  export const Chain: { POLYGON: 137; ETHEREUM: 1 };
  export const Side: { BUY: 'BUY'; SELL: 'SELL' };
}

declare module 'pg-query-stream' {
  import { Readable } from 'stream';
  export default class QueryStream extends Readable {
    constructor(text: string, values?: unknown[], options?: Record<string, unknown>);
    text: string;
    values?: unknown[];
    cursor: number;
    rowCount: number;
  }
}

declare module 'mysql2' {
  export interface Connection {
    query(sql: string, values?: unknown[]): Promise<unknown[]>;
    execute(sql: string, values?: unknown[]): Promise<unknown[]>;
    beginTransaction(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    release(): void;
    connect(): Promise<void>;
    end(): Promise<void>;
    ping(): Promise<void>;
  }
  export interface Pool {
    getConnection(): Promise<Connection>;
    execute(sql: string, values?: unknown[]): Promise<unknown[]>;
    query(sql: string, values?: unknown[]): Promise<unknown[]>;
    end(): Promise<void>;
  }
  export interface PoolOptions {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
    connectionLimit?: number;
  }
  export function createPool(options: PoolOptions): Pool;
  export function createConnection(options: PoolOptions): Connection;
  export default { createPool, createConnection };
}

declare module '@cloudflare/workers-types' {
  export interface Request {
    cf: Record<string, unknown>;
  }
  export interface KVNamespace {
    get(key: string): Promise<string | null>;
    get<T>(key: string, type: 'json'): Promise<T | null>;
    put(key: string, value: string | ReadableStream | ArrayBuffer, options?: { expirationTtl?: number; metadata?: Record<string, unknown> }): Promise<void>;
    delete(key: string): Promise<void>;
    list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: Array<{ name: string; metadata?: Record<string, unknown>; expiration?: number }>; listComplete: boolean; cursor?: string }>;
  }
  export interface DurableObjectState {
    storage: {
      get<T = unknown>(key: string): Promise<T | undefined>;
      put(key: string, value: T): Promise<void>;
      delete(key: string): Promise<void>;
      deleteAll(): Promise<void>;
      list<T = unknown>(options?: { prefix?: string }): Promise<Map<string, T>>;
      getAlarm(): Promise<number | null>;
      setAlarm(alarmTime: number | Date): Promise<void>;
      deleteAlarm(): Promise<void>;
    };
    id: { toString(): string };
    waitUntil(promise: Promise<unknown>): void;
    acceptWebSocket(ws: WebSocket, tags?: Record<string, string>): void;
    getWebSockets(): WebSocket[];
    env: Record<string, unknown>;
  }
  export interface DurableObject {
    fetch(request: Request): Promise<Response>;
    alarm?(): Promise<void>;
  }
  export interface DurableObjectNamespace<D extends DurableObject> {
    idFromName(name: string): DurableObjectId;
    idFromString(id: string): DurableObjectId;
    get(id: DurableObjectId): D;
    newUniqueId(options?: { jurisdiction?: 'eu' | 'fedramp' }): DurableObjectId;
  }
  export interface DurableObjectId {
    toString(): string;
    equals(other: DurableObjectId): boolean;
  }
  export interface Fetcher {
    fetch(request: Request, options?: Record<string, unknown>): Promise<Response>;
  }
  export interface HtmlPagePayload {
    markup: string;
    status?: number;
    headers?: Record<string, string>;
  }
  export function html(payload: HtmlPagePayload): Response;
  export function redirect(url: string, status?: number): Response;
}

declare module 'win32pty' {
  export interface PtyProcess {
    on(evt: string, cb: (...args: unknown[]) => void): void;
    write(data: string): void;
    resize(cols: number, rows: number): void;
    kill(signal?: string): void;
    destroy(): void;
  }
  export function start(opts: { cols: number; rows: number; exe: string; args?: string[]; cwd?: string; env?: Record<string, string> }): PtyProcess;
}
