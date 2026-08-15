import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import express from 'express';
import request from 'supertest';

const mockValidate = vi.fn();

vi.mock('../../../desk/gate/raas-gate', () => ({
	default: {
		getInstance: () => ({ validateApiKey: (k: string) => mockValidate(k) }),
	},
}));

import { resolveLicense } from '../license-resolver';
import { requireTier } from '../feature-gate';

function makeReq(authorization?: string): Request {
	const req = {} as Request;
	req.headers = authorization ? { authorization } : {};
	return req;
}

function runMiddleware(req: Request): Request {
	const res = {} as Response;
	const next = vi.fn() as unknown as NextFunction;
	resolveLicense(req, res, next);
	return req;
}

describe('resolveLicense', () => {
	beforeEach(() => {
		mockValidate.mockReset();
	});

	it('leaves req.license undefined with no Authorization header', () => {
		const req = runMiddleware(makeReq());
		expect(req.license).toBeUndefined();
		expect(mockValidate).not.toHaveBeenCalled();
	});

	it('ignores non-Bearer Authorization header', () => {
		const req = runMiddleware(makeReq('Basic abc123'));
		expect(req.license).toBeUndefined();
		expect(mockValidate).not.toHaveBeenCalled();
	});

	it('attaches license returned by the RaaS gate for a valid Bearer key', () => {
		mockValidate.mockReturnValue({ id: 'lic-1', tier: 'PRO' });
		const req = runMiddleware(makeReq('Bearer lic-key-pro'));
		expect(mockValidate).toHaveBeenCalledWith('lic-key-pro');
		expect(req.license).toEqual({ id: 'lic-1', tier: 'PRO' });
	});

	it('leaves req.license undefined for an unknown Bearer key (fail-closed)', () => {
		mockValidate.mockReturnValue(undefined);
		const req = runMiddleware(makeReq('Bearer unknown-key'));
		expect(req.license).toBeUndefined();
	});

	it('always calls next() so request handling proceeds', () => {
		const req = makeReq('Bearer key');
		const res = {} as Response;
		const next = vi.fn() as unknown as NextFunction;
		mockValidate.mockReturnValue({ id: 'lic-1', tier: 'PRO' });
		resolveLicense(req, res, next);
		expect(next).toHaveBeenCalledTimes(1);
	});
});

describe('resolveLicense + requireTier end-to-end', () => {
	function buildGatedApp() {
		const app = express();
		app.use(resolveLicense);
		app.get('/gated', requireTier('PRO'), (_req: Request, res: Response) => {
			res.json({ ok: true });
		});
		return app;
	}

	beforeEach(() => {
		mockValidate.mockReset();
	});

	it('returns 200 with a valid PRO Bearer key (gate satisfiable)', async () => {
		mockValidate.mockReturnValue({ id: 'lic-1', tier: 'PRO' });
		const res = await request(buildGatedApp()).get('/gated').set('Authorization', 'Bearer pro-key');
		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
	});

	it('returns 401 without a Bearer key (fail-closed)', async () => {
		const res = await request(buildGatedApp()).get('/gated');
		expect(res.status).toBe(401);
	});

	it('returns 401 for a key that does not resolve to a license', async () => {
		mockValidate.mockReturnValue(undefined);
		const res = await request(buildGatedApp()).get('/gated').set('Authorization', 'Bearer unknown');
		expect(res.status).toBe(401);
	});
});
