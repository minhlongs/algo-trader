/**
 * Rate Limiter Test Fixtures
 *
 * Factory helpers for creating mock Request/Response objects.
 */

import type { Request, Response } from 'express';

export function makeReq(overrides: Partial<{ ip: string; headers: Record<string, string> }> = {}): Request {
  return {
    ip: overrides.ip ?? '127.0.0.1',
    headers: overrides.headers ?? {},
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Request;
}

export function makeRes(): Response & {
  statusCode: number;
  body: Record<string, unknown>;
  headers: Record<string, string | number>;
} {
  const res = {
    statusCode: 0,
    body: {} as Record<string, unknown>,
    headers: {} as Record<string, string | number>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: Record<string, unknown>) {
      res.body = data;
      return res;
    },
    setHeader(name: string, value: string | number) {
      res.headers[name] = value;
      return res;
    },
  } as unknown as Response & {
    statusCode: number;
    body: Record<string, unknown>;
    headers: Record<string, string | number>;
  };
  return res;
}
