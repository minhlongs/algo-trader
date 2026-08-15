/**
 * Type definitions for the edge-proxy worker.
 * Extracted to avoid cross-file KV namespace type variance
 * from @cloudflare/workers-types.
 */

import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

/** Internal environment bindings used by the worker */
export interface _InternalEnv {
  CACHE: KVNamespace;
  ENVIRONMENT: string;
  VPS_ORIGIN?: string;
  JWT_SECRET: string;
  ALLOWED_ORIGINS?: string;
  REGION_ROUTING_ENABLED?: string;
  SUBSCRIBERS?: D1Database;
  NOWPAYMENTS_IPN_SECRET?: string;
  METRIC_PASSWORD?: string;
}

/**
 * Public Env type — loose wrapper to avoid struct-assignment checks
 * between different workers-types version instances.
 */
export type Env = _InternalEnv & Record<string, unknown>;

/** Cloudflare Workers request.cf property type */
export interface CloudflareCf {
  country?: string;
  city?: string;
  region?: string;
  latitude?: string;
  longitude?: string;
  timezone?: string;
  asn?: number;
  asOrganization?: string;
}
