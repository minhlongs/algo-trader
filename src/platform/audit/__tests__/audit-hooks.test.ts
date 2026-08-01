import {
	describe,
	expect,
	it,
	vi,
	beforeEach,
} from 'vitest';
import {
	emitRateLimitAuditEvent,
	emitTradeAuditEvent,
	emitConfigAuditEvent,
	emitCredentialDeletionAuditEvent,
	emitCredentialUpsertAuditEvent,
} from '../audit-hooks';

const APPEND_REGEX =
	/^appendTenantAuditLog\(audit-trail-[a-z0-9-]+,\s*rate_limit\.exceeded,/i;

vi.mock('../tenant-audit-log', () => ({
	appendTenantAuditLog: vi.fn(async () => {}),
}));

import { appendTenantAuditLog } from '../tenant-audit-log';
const mockedAppend = vi.mocked(appendTenantAuditLog);

describe('audit-hooks', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('emitRateLimitAuditEvent', () => {
		it('emits rate_limit.exceeded with enriched metadata', async () => {
			await expect(
				emitRateLimitAuditEvent({
					tenantId: 't-1',
					tier: 'PRO',
					endpoint: '/api/v1/trades',
					remainingMs: 233,
					retryAfter: 1000,
				}),
			).resolves.toBeUndefined();

			expect(mockedAppend).toHaveBeenCalledTimes(1);
			const [tenantId, eventType, , , metadata] =
				mockedAppend.mock.calls[0] as [
					string,
					string,
					string,
					string,
					Record<string, unknown>,
				];
			expect(tenantId).toBe('t-1');
			expect(eventType).toBe('rate_limit.exceeded');
			expect(metadata).toEqual(
				expect.objectContaining({
					endpoint: '/api/v1/trades',
					tier: 'PRO',
					remainingMs: 233,
					retryAfter: 1000,
				}),
			);
		});
	});

	describe('emitCredentialDeletionAuditEvent', () => {
		it('emits credentials.deleted', async () => {
			await expect(
				emitCredentialDeletionAuditEvent({
					tenantId: 't-1',
					actionBy: 'operator',
					endpoint: '/api/v1/credentials',
				}),
			).resolves.toBeUndefined();

			expect(mockedAppend).toHaveBeenCalledTimes(1);
			const [, eventType, actionBy] = mockedAppend.mock.calls[0] as [
				string,
				string,
				string,
			];
			expect(eventType).toBe('credentials.deleted');
			expect(actionBy).toBe('operator');
		});
	});

	describe('emitCredentialUpsertAuditEvent', () => {
		it('emits credentials.upsert', async () => {
			await expect(
				emitCredentialUpsertAuditEvent({
					tenantId: 't-1',
					actionBy: 'operator',
					endpoint: '/api/v1/subscriber/credentials',
				}),
			).resolves.toBeUndefined();

			expect(mockedAppend).toHaveBeenCalledTimes(1);
			const [, eventType, actionBy] = mockedAppend.mock.calls[0] as [
				string,
				string,
				string,
			];
			expect(eventType).toBe('credentials.upsert');
			expect(actionBy).toBe('operator');
		});
	});

	describe('emitTradeAuditEvent', () => {
		it('emits trade_executed', async () => {
			await expect(
				emitTradeAuditEvent({
					eventType: 'trade_executed',
					tenantId: 't-1',
					actionBy: 'trader',
				}),
			).resolves.toBeUndefined();

			expect(mockedAppend).toHaveBeenCalledTimes(1);
			const [, eventType, actionBy] = mockedAppend.mock.calls[0] as [
				string,
				string,
				string,
			];
			expect(eventType).toBe('trade_executed');
			expect(actionBy).toBe('trader');
		});

		it('emits trade_rejected', async () => {
			await expect(
				emitTradeAuditEvent({
					eventType: 'trade_rejected',
					tenantId: 't-1',
					actionBy: 'trader',
					reason: 'insufficient balance',
					metadata: { symbol: 'GEEK', qty: 1 },
				}),
			).resolves.toBeUndefined();

			expect(mockedAppend).toHaveBeenCalledTimes(1);
			const [, eventType, actionBy, reason, metadata] =
				mockedAppend.mock.calls[0] as [
					string,
					string,
					string,
					string,
					Record<string, unknown>,
				];
			expect(eventType).toBe('trade_rejected');
			expect(actionBy).toBe('trader');
			expect(reason).toBe('insufficient balance');
			expect(metadata).toEqual({ symbol: 'GEEK', qty: 1 });
		});
	});

	describe('emitConfigAuditEvent', () => {
		it('emits config_changed', async () => {
			await expect(
				emitConfigAuditEvent({
					tenantId: 't-1',
					actionBy: 'admin',
					reason: 'updated limits',
					metadata: { key: 'max_qty', value: 999 },
				}),
			).resolves.toBeUndefined();

			expect(mockedAppend).toHaveBeenCalledTimes(1);
			const [, eventType, actionBy, reason, metadata] =
				mockedAppend.mock.calls[0] as [
					string,
					string,
					string,
					string,
					Record<string, unknown>,
				];
			expect(eventType).toBe('config_changed');
			expect(actionBy).toBe('admin');
			expect(reason).toBe('updated limits');
			expect(metadata).toEqual({ key: 'max_qty', value: 999 });
		});
	});
});
