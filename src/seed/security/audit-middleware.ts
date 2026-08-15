/**
 * Express / Connect compatible middleware for API audit logging.
 *
 * Contract:
 * 1. Accepts `x-request-id` for correlation; when absent, a UUID is
 *    generated so auditing never blocks or rejects a request.
 * 2. Attaches `requestId` to `res.locals` for downstream correlation.
 * 3. Intercepts `res.json` to log the response outcome (fire-and-forget).
 *
 * @module security/audit-middleware
 */

import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

import { logger } from '../../shared/utils/logger';

import { hashIpAddress } from './audit-ip-hash';
import { logAudit } from './audit-log';

import type { AuditResult, IAuditEntry } from './types';

const SENSITIVE_KEYS = new Set([
'password',
'token',
'secret',
'apiKey',
'accessKey',
'refreshToken',
]);

/** Extend Express locals with audit fields. */
interface AuditLocals {
 requestId: string;
 [key: string]: unknown;
}

/** Extract first string value from Express header (handles string | string[]). */
function firstHeaderValue(
 value: string | string[] | undefined,
): string | null {
 if (typeof value === 'string') return value;
 if (Array.isArray(value) && value.length > 0) return value[0];
 return null;
}

/**
 * Express-compatible audit logging middleware.
 * Wraps both res.json() and res.status().json() to capture status + body,
 * then fires audit entry asynchronously (fire-and-forget).
 *
 * @example
 * import { auditMiddleware } from '@/seed/security/audit-middleware';
 * app.use(auditMiddleware);
 */
export function auditMiddleware(
 req: Request,
 res: Response<unknown, AuditLocals>,
 next: NextFunction,
 ): void {
 const rawRequestId = req.headers['x-request-id'];
 const requestId = firstHeaderValue(rawRequestId) ?? randomUUID();
 res.locals.requestId = requestId;

 const origStatus = res.status.bind(res);
 const origJson = res.json.bind(res);

 let lastStatusCode = res.statusCode ?? 200;

 const fire = (body: unknown): void => {
 // logAudit is fail-closed and rejects on write failure; the entry is already
 // captured by the dead-letter queue at that point. Swallow here so a DB blip
 // cannot surface as an unhandled rejection and terminate the process.
 fireAudit(req, res, lastStatusCode, body).catch((err: unknown) => {
 logger.error('[AuditMiddleware] Audit write failed', {
 requestId: res.locals.requestId,
 error: err instanceof Error ? err.message : String(err),
 });
 });
 };

 res.status = ((code: number): ReturnType<typeof origStatus> => {
 lastStatusCode = code;
 const chain = origStatus(code);
 const origChainJson = chain.json.bind(chain);
 chain.json = (body: unknown): Response<unknown, AuditLocals> => {
 fire(body);
 return origChainJson(body);
 };
 return chain;
 }) as typeof res.status;

 res.json = (body: unknown): Response<unknown, AuditLocals> => {
 fire(body);
 return origJson(body);
 };

 next();
}

/** Build and insert the audit row after response is committed. */
function fireAudit(
 req: Request,
 res: Response<unknown, AuditLocals>,
 statusCode: number,
 body: unknown,
 ): Promise<void> {
 const rawForwarded = req.headers['x-forwarded-for'];
 const ipRaw = firstHeaderValue(rawForwarded);

 const result: AuditResult =
 statusCode >= 500 ? 'failure' : statusCode >= 400 ? 'denied' : 'success';

 const tenantId = req.user?.tenantId;

 const entry: IAuditEntry = {
 id: res.locals.requestId,
 timestamp: new Date().toISOString(),
 actor: res.locals.requestId,
 action: `${req.method.toLowerCase()}.${stripLeadingSlash(req.url)}`,
 resource: 'API',
 result,
 metadata: {
 status: statusCode,
 ...(typeof body === 'object' && body !== null
 ? { body: sanitizeBody(body as Record<string, unknown>) }
 : {}),
 },
 ipHash: hashIpAddress(ipRaw),
 tenantId,
 };

 return logAudit(entry);
}

/** Remove leading `/` and replace remaining `/` with `.` for action naming. */
function stripLeadingSlash(url: string): string {
 return url.startsWith('/') ? url.slice(1).replace(/\//g, '.') : url;
}

/** Strip secrets from a response body before storing in metadata. */
function sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
 const out: Record<string, unknown> = {};
 for (const [k, v] of Object.entries(body)) {
 if (SENSITIVE_KEYS.has(k)) {
 out[k] = '[REDACTED]';
 } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
 out[k] = sanitizeBody(v as Record<string, unknown>);
 } else {
 out[k] = v;
 }
 }
 return out;
}
