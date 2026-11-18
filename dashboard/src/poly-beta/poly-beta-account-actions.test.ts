import { describe, expect, it } from 'vitest';
import { requestAccountDeletion, requestLogout } from './poly-beta-account-actions';
import type { PolyBetaSession } from './use-poly-beta-session';

type AuthedRequest = PolyBetaSession['authedRequest'];

function stubRequest(res: {
  status: number;
  data: Record<string, unknown>;
  abortedSession?: boolean;
}): AuthedRequest {
  return (async <T,>(_path: string, _options: unknown, _expire = true) => ({
    status: res.status,
    data: res.data as T,
    abortedSession: res.abortedSession ?? false,
  })) as unknown as AuthedRequest;
}

describe('account request result interpretation', () => {
  it('treats an expected logout 401 as a completed logout without expiring the session', async () => {
    const expireFlags: Array<boolean | undefined> = [];
    const authedRequest = (async <T,>(_path: string, _options: unknown, expire = true) => {
      expireFlags.push(expire);
      return { status: 401, data: {} as T, abortedSession: false };
    }) as unknown as AuthedRequest;

    await expect(requestLogout(authedRequest, 'en')).resolves.toEqual({ outcome: 'session-cleared' });
    expect(expireFlags).toEqual([false]);
  });

  it('does not clear the session twice when the auth path already aborted it', async () => {
    const aborted = stubRequest({ status: 401, data: {}, abortedSession: true });
    await expect(requestLogout(aborted, 'vi')).resolves.toEqual({ outcome: 'session-aborted' });
    await expect(requestAccountDeletion(aborted, 'vi')).resolves.toEqual({ outcome: 'session-aborted' });
  });

  it('reports a localized failure instead of a fake logout on a server error', async () => {
    const result = await requestLogout(stubRequest({ status: 500, data: {} }), 'vi');
    expect(result.outcome).toBe('failed');
    if (result.outcome === 'failed') expect(result.notice.message).toContain('Đăng xuất thất bại');
  });

  it('reports a localized failure instead of a fake deletion when ok is false', async () => {
    const result = await requestAccountDeletion(stubRequest({ status: 200, data: { ok: false } }), 'en');
    expect(result.outcome).toBe('failed');
    if (result.outcome === 'failed') expect(result.notice.message).toContain('Account deletion failed');
  });
});
