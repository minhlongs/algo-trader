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

vi.mock('../../../seed/security/audit-log', () => ({
	logAudit: vi.fn(async () => {}),
	hashIpAddress: vi.fn(() => 'mocked-hash'),
}));

import { logAudit, hashIpAddress } from '../../../seed/security/audit-log';
const mockedLogAudit = vi.mocked(logAudit);
const mockedHashIpAddress = vi.mocked(hashIpAddress);

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

			expect(mockedLogAudit).toHaveBeenCalledTimes(1);
			const [entry] = mockedLogAudit.mock.calls[0] as [any];
			expect(entry.tenantId).toBe('t-1');
			expect(entry.action).toBe('rate_limit.exceeded');
			expect(entry.metadata).toEqual(
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

			expect(mockedLogAudit).toHaveBeenCalledTimes(1);
			const [entry] = mockedLogAudit.mock.calls[0] as [any];
			expect(entry.action).toBe('credentials.deleted');
			expect(entry.actor).toBe('operator');
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

			expect(mockedLogAudit).toHaveBeenCalledTimes(1);
			const [entry] = mockedLogAudit.mock.calls[0] as [any];
			expect(entry.action).toBe('credentials.upsert');
			expect(entry.actor).toBe('operator');
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

			expect(mockedLogAudit).toHaveBeenCalledTimes(1);
			const [entry] = mockedLogAudit.mock.calls[0] as [any];
			expect(entry.action).toBe('trade_executed');
			expect(entry.actor).toBe('trader');
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

			expect(mockedLogAudit).toHaveBeenCalledTimes(1);
			const [entry] = mockedLogAudit.mock.calls[0] as [any];
			expect(entry.action).toBe('trade_rejected');
			expect(entry.actor).toBe('trader');
			expect(entry.metadata?.reason).toBe('insufficient balance');
			expect(entry.metadata?.symbol).toBe('GEEK');
			expect(entry.metadata?.qty).toBe(1);
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

			expect(mockedLogAudit).toHaveBeenCalledTimes(1);
			const [entry] = mockedLogAudit.mock.calls[0] as [any];
			expect(entry.action).toBe('config.changed');
			expect(entry.actor).toBe('admin');
			expect(entry.metadata?.reason).toBe('updated limits');
			expect(entry.metadata?.key).toBe('max_qty');
			expect(entry.metadata?.value).toBe(999);
		});

		it('defaults reason to "config_changed" when omitted', async () => {
			// Covers the `params.reason ?? 'config_changed'` fallback (line 131)
			await expect(
				emitConfigAuditEvent({
					tenantId: 't-1',
					actionBy: 'admin',
				}),
			).resolves.toBeUndefined();

			const [entry] = mockedLogAudit.mock.calls[0] as [any];
			expect(entry.metadata?.reason).toBe('config_changed');
		});
	});
});
