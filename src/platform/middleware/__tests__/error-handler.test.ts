/**
 * Tests for error-handler — covers the global error handler, the
 * createApiError factory, and the asyncHandler wrapper.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../shared/utils/logger', () => ({ logger: loggerMock }));

import { errorHandler, createApiError, asyncHandler } from '../error-handler';

describe('platform/middleware: error-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('errorHandler', () => {
    function makeRes(): { res: Partial<Response>; status: (n: number) => Partial<Response>; json: (o: unknown) => void } {
      const res: Partial<Response> = {};
      res.status = vi.fn().mockReturnValue(res);
      res.json = vi.fn();
      return { res: res as Response, status: res.status as ReturnType<typeof vi.fn>, json: res.json as (o: unknown) => void };
    }

    it('responds with the error statusCode and code when provided', () => {
      const { res } = makeRes();
      const err = createApiError('boom', 400, 'BAD_REQUEST');
      errorHandler(err, {} as Request, res, vi.fn() as NextFunction);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: { message: 'boom', code: 'BAD_REQUEST' },
      });
    });

    it('defaults to 500 and INTERNAL_ERROR for a plain Error', () => {
      const { res } = makeRes();
      const err = new Error('something broke') as unknown;
      errorHandler(err as never, {} as Request, res, vi.fn() as NextFunction);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: { message: 'something broke', code: 'INTERNAL_ERROR' },
      });
    });

    it('falls back to "Internal server error" when err.message is empty', () => {
      const { res } = makeRes();
      const err = createApiError('', 503);
      errorHandler(err, {} as Request, res, vi.fn() as NextFunction);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        error: { message: 'Internal server error', code: 'OPERATIONAL_ERROR' },
      });
    });

    it('logs the error details via logger.error', () => {
      const { res } = makeRes();
      const err = createApiError('logged boom', 418, 'IM_A_TEAPOT');
      errorHandler(err, {} as Request, res, vi.fn() as NextFunction);

      expect(loggerMock.error).toHaveBeenCalledWith(
        '[API Error]',
        expect.objectContaining({
          name: 'Error',
          message: 'logged boom',
          code: 'IM_A_TEAPOT',
          statusCode: 418,
          stack: expect.any(String),
        }),
      );
    });
  });

  describe('createApiError', () => {
    it('creates an ApiError with the given message, statusCode, and code', () => {
      const err = createApiError('not found', 404, 'NOT_FOUND');
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('not found');
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe('NOT_FOUND');
    });

    it('defaults code to OPERATIONAL_ERROR when omitted', () => {
      const err = createApiError('nope', 500);
      expect(err.code).toBe('OPERATIONAL_ERROR');
    });

    it('defaults statusCode to 500 when omitted', () => {
      const err = createApiError('nope');
      expect(err.statusCode).toBe(500);
    });
  });

  describe('asyncHandler', () => {
    it('forwards resolved promises without calling next', async () => {
      const next = vi.fn();
      const fn = async (req: Request, res: Response, _next: NextFunction) => {
        res.status(200).json({ ok: true });
      };
      const wrapped = asyncHandler(fn);

      const res: Partial<Response> = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      await wrapped({} as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('calls next with the rejected error', async () => {
      const next = vi.fn();
      const boom = new Error('async boom');
      const fn = async () => {
        throw boom;
      };
      const wrapped = asyncHandler(fn);

      await wrapped({} as Request, {} as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(boom);
    });
  });
});
