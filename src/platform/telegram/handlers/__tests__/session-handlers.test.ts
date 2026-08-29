/**
 * Tests for session-handlers — /link, /unlink, /notifications Telegram commands.
 *
 * userSessionRepo is mocked with vi.hoisted fakes; ctx is a minimal Context
 * stand-in whose reply() captures the last message and parse_mode.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetByUserId, mockUpsert } = vi.hoisted(() => ({
  mockGetByUserId: vi.fn(),
  mockUpsert: vi.fn(),
}));

vi.mock('../../user-session-repository-d1', () => ({
  userSessionRepo: {
    getByUserId: mockGetByUserId,
    upsert: mockUpsert,
  },
}));

import { handleLink, handleUnlink, handleNotifications } from '../session-handlers';

interface ReplyCall {
  text: string;
  opts: { parse_mode?: string } | undefined;
}

function makeCtx(text: string, userId = 1): {
  ctx: {
    from?: { id: number };
    message: { text?: string };
    reply: ReturnType<typeof vi.fn>;
  };
  replies: ReplyCall[];
} {
  const replies: ReplyCall[] = [];
  const reply = vi.fn(async (text: string, opts?: { parse_mode?: string }) => {
    replies.push({ text, opts });
  });
  return {
    ctx: { from: { id: userId }, message: { text }, reply },
    replies,
  };
}

interface Session {
  userId: number;
  licenseKeys: string[];
  notificationsEnabled: boolean;
  lastCommand: string;
}

describe('handleLink', () => {
  beforeEach(() => {
    mockGetByUserId.mockReset();
    mockUpsert.mockReset();
  });

  it('returns early when ctx.from is missing', async () => {
    const { ctx } = makeCtx('/link KEY');
    ctx.from = undefined;
    await handleLink(ctx as never);
    expect(mockGetByUserId).not.toHaveBeenCalled();
  });

  it('replies with usage when the license key is missing', async () => {
    const { ctx, replies } = makeCtx('/link');
    await handleLink(ctx as never);
    expect(replies).toHaveLength(1);
    expect(replies[0].text).toBe('Usage: /link <your-license-key>');
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('creates a new session when none exists', async () => {
    const { ctx, replies } = makeCtx('/link ABC-123');
    mockGetByUserId.mockResolvedValue(undefined);
    await handleLink(ctx as never);
    expect(mockUpsert).toHaveBeenCalledWith({
      userId: 1,
      licenseKeys: ['ABC-123'],
      notificationsEnabled: true,
      lastCommand: 'link',
    });
    expect(replies[0].text).toContain('ABC-123');
    expect(replies[0].text).toContain('linked successfully');
    expect(replies[0].opts?.parse_mode).toBe('Markdown');
  });

  it('replies already-linked when the key exists', async () => {
    const { ctx, replies } = makeCtx('/link ABC-123');
    mockGetByUserId.mockResolvedValue({
      userId: 1,
      licenseKeys: ['ABC-123'],
      notificationsEnabled: true,
      lastCommand: 'link',
    } as Session);
    await handleLink(ctx as never);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(replies[0].text).toContain('already linked');
  });

  it('appends the key when it is not yet linked', async () => {
    const { ctx, replies } = makeCtx('/link ABC-123');
    mockGetByUserId.mockResolvedValue({
      userId: 1,
      licenseKeys: ['OTHER'],
      notificationsEnabled: true,
      lastCommand: 'link',
    } as Session);
    await handleLink(ctx as never);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ licenseKeys: ['OTHER', 'ABC-123'], lastCommand: 'link' }),
    );
    expect(replies[0].text).toContain('linked successfully');
  });
});

describe('handleUnlink', () => {
  beforeEach(() => {
    mockGetByUserId.mockReset();
    mockUpsert.mockReset();
  });

  it('returns early when ctx.from is missing', async () => {
    const { ctx } = makeCtx('/unlink KEY');
    ctx.from = undefined;
    await handleUnlink(ctx as never);
    expect(mockGetByUserId).not.toHaveBeenCalled();
  });

  it('replies with usage when the license key is missing', async () => {
    const { ctx, replies } = makeCtx('/unlink');
    await handleUnlink(ctx as never);
    expect(replies[0].text).toBe('Usage: /unlink <your-license-key>');
  });

  it('reports no linked keys when no session exists', async () => {
    const { ctx, replies } = makeCtx('/unlink ABC-123');
    mockGetByUserId.mockResolvedValue(undefined);
    await handleUnlink(ctx as never);
    expect(replies[0].text).toBe('No license keys linked.');
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('reports key not found when absent from the session', async () => {
    const { ctx, replies } = makeCtx('/unlink ABC-123');
    mockGetByUserId.mockResolvedValue({
      userId: 1,
      licenseKeys: ['OTHER'],
      notificationsEnabled: true,
      lastCommand: 'link',
    } as Session);
    await handleUnlink(ctx as never);
    expect(replies[0].text).toContain('not found');
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('removes the key and persists', async () => {
    const { ctx, replies } = makeCtx('/unlink ABC-123');
    mockGetByUserId.mockResolvedValue({
      userId: 1,
      licenseKeys: ['ABC-123', 'OTHER'],
      notificationsEnabled: true,
      lastCommand: 'link',
    } as Session);
    await handleUnlink(ctx as never);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ licenseKeys: ['OTHER'], lastCommand: 'unlink' }),
    );
    expect(replies[0].text).toContain('unlinked');
  });
});

describe('handleNotifications', () => {
  beforeEach(() => {
    mockGetByUserId.mockReset();
    mockUpsert.mockReset();
  });

  it('returns early when ctx.from is missing', async () => {
    const { ctx } = makeCtx('/notifications');
    ctx.from = undefined;
    await handleNotifications(ctx as never);
    expect(mockGetByUserId).not.toHaveBeenCalled();
  });

  it('creates a session enabling notifications when none exists', async () => {
    const { ctx, replies } = makeCtx('/notifications');
    mockGetByUserId.mockResolvedValue(undefined);
    await handleNotifications(ctx as never);
    expect(mockUpsert).toHaveBeenCalledWith({
      userId: 1,
      licenseKeys: [],
      notificationsEnabled: true,
      lastCommand: 'notifications',
    });
    expect(replies[0].text).toContain('Notifications enabled');
  });

  it('toggles notifications on and reports enabled', async () => {
    const { ctx, replies } = makeCtx('/notifications');
    mockGetByUserId.mockResolvedValue({
      userId: 1,
      licenseKeys: [],
      notificationsEnabled: false,
      lastCommand: 'notifications',
    } as Session);
    await handleNotifications(ctx as never);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ notificationsEnabled: true, lastCommand: 'notifications' }),
    );
    expect(replies[0].text).toContain('Notifications enabled');
    expect(replies[0].opts?.parse_mode).toBe('Markdown');
  });

  it('toggles notifications off and reports disabled', async () => {
    const { ctx, replies } = makeCtx('/notifications');
    mockGetByUserId.mockResolvedValue({
      userId: 1,
      licenseKeys: ['KEY'],
      notificationsEnabled: true,
      lastCommand: 'notifications',
    } as Session);
    await handleNotifications(ctx as never);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ notificationsEnabled: false }),
    );
    expect(replies[0].text).toContain('Notifications disabled');
    expect(replies[0].text).toContain('NOT');
  });
});