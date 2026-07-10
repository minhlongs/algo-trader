/** Cloudflare KV + Fetch types for Workers build (Wrangler v3 runtime provides these at deploy time). */
/* eslint-disable @typescript-eslint/no-empty-interface */

interface KVNamespace {
 get(key: string): Promise<string | null>;
 get(key: string, options: { type: 'text' }): Promise<string | null>;
 get(key: string, options: { type: 'json' }): Promise<object | null>;
 get(key: string, options: { type: 'arrayBuffer' }): Promise<ArrayBuffer | null>;
 get(key: string, options: { type: 'stream' }): Promise<ReadableStream | null>;
 put(key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream, options?: { expirationTtl?: number }): Promise<void>;
 delete(key: string): Promise<void>;
}

interface RequestInitCfProperties {
 cacheTtl?: number;
}

interface RequestInitCf {
 cacheTtl: number;
}

interface RequestInitWithCf extends RequestInit {
 cf?: RequestInitCf;
}

interface FetchEvent {
 request: Request;
 respondWith(response: Promise<Response>): void;
}

interface ExportedHandler<Env = unknown> {
 fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response>;
}

declare var self: ServiceWorkerGlobalScope & { fetch: ExportedHandler['fetch'] };

// Durable Object types (provided by Cloudflare Workers runtime)
interface DurableObjectState {
 id: { toString(): string };
 storage: {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
 };
}
interface DurableObjectNamespace {
 idFromName(name: string): DurableObjectId;
 newUniqueId(options?: { jurisdiction?: string }): DurableObjectId;
 get(id: DurableObjectId): DurableObjectStub;
}
interface DurableObjectId { toString(): string; }
interface DurableObjectStub {
 fetch(request: Request): Promise<Response>;
}

// Durable Object decorator (used with class declarations)
function DurableObject(namespace: string): ClassDecorator;
