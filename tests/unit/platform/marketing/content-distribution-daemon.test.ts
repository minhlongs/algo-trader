/**
 * Content Distribution Daemon & Multi-Channel Publisher Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ContentDistributionDaemon } from '../../../../src/platform/marketing/content-distribution-daemon';
import type { PostMetadata } from '../../../../src/platform/marketing/distribution-types';
import { readJsonl } from '../../../../src/shared/persistence/file-store';

describe('ContentDistributionDaemon', () => {
  let tmpDir: string;
  let auditLogFile: string;
  let daemon: ContentDistributionDaemon;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marketing-test-'));
    auditLogFile = path.join(tmpDir, 'test-distribution-audit.jsonl');

    // Create sample marketing markdown files
    fs.writeFileSync(path.join(tmpDir, 'launch-twitter-alpha.md'), '# Super Alpha Signals Ready\n\nFull speed.');
    fs.writeFileSync(path.join(tmpDir, 'blog-arbitrage.md'), '# Negative-Risk Multi-Outcome Arbitrage\n\nDeep dive.');
    fs.writeFileSync(path.join(tmpDir, 'announcement-discord-community.md'), 'Discord announcement without heading');
    fs.writeFileSync(path.join(tmpDir, 'reddit-discussion.md'), '# Reddit Alpha Discussion\n\nDiscussion content');
    fs.writeFileSync(path.join(tmpDir, 'weekly-email-digest.md'), '# Weekly Newsletter Digest\n\nDigest content');

    daemon = new ContentDistributionDaemon({ marketingDir: tmpDir, auditLogPath: auditLogFile });
  });

  afterEach(() => {
    daemon.stopDaemon();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* Ignore */ }
  });

  it('syncs marketing templates from directory without modifying files', () => {
    const discovered = daemon.syncFromDirectory();
    expect(discovered).toHaveLength(5);

    const twitterPost = discovered.find((p) => p.slug === 'launch-twitter-alpha');
    expect(twitterPost).toBeDefined();
    expect(twitterPost?.title).toBe('Super Alpha Signals Ready');
    expect(twitterPost?.targetChannels).toContain('TWITTER');

    const blogPost = discovered.find((p) => p.slug === 'blog-arbitrage');
    expect(blogPost).toBeDefined();
    expect(blogPost?.title).toBe('Negative-Risk Multi-Outcome Arbitrage');
    expect(blogPost?.targetChannels).toContain('BLOG');

    const discordPost = discovered.find((p) => p.slug === 'announcement-discord-community');
    expect(discordPost).toBeDefined();
    expect(discordPost?.title).toBe('announcement-discord-community');
    expect(discordPost?.targetChannels).toContain('DISCORD');

    const redditPost = discovered.find((p) => p.slug === 'reddit-discussion');
    expect(redditPost?.targetChannels).toContain('REDDIT');

    const emailPost = discovered.find((p) => p.slug === 'weekly-email-digest');
    expect(emailPost?.targetChannels).toContain('NEWSLETTER');
  });

  it('returns empty array when marketing directory does not exist', () => {
    const missing = daemon.syncFromDirectory(path.join(tmpDir, 'nonexistent-sub-dir'));
    expect(missing).toEqual([]);
  });

  it('queues post and validates schema', () => {
    const post: PostMetadata = {
      id: 'custom-post-1',
      title: 'Breaking Milestone',
      slug: 'breaking-milestone',
      content: 'Milestone reached: 15,000 green tests',
      tags: ['release', 'testing'],
      targetChannels: ['TELEGRAM', 'BLOG'],
      author: 'Tester',
      locale: 'bilingual',
      status: 'QUEUED',
    };

    daemon.queuePost(post);
    expect(daemon.getQueue()).toHaveLength(1);
    expect(daemon.getQueue()[0].id).toBe('custom-post-1');
  });

  it('dispatches queued posts and generates syndication records', async () => {
    daemon.syncFromDirectory();
    const records = await daemon.dispatchQueued();

    expect(records.length).toBeGreaterThan(0);
    expect(records.every((r) => r.status === 'SUCCESS')).toBe(true);

    const history = daemon.getHistory();
    expect(history.length).toBe(records.length);

    // Audit logs should be written to auditLogFile
    expect(fs.existsSync(auditLogFile)).toBe(true);
    const auditEntries = await readJsonl<{ event: string; payload: Record<string, unknown> }>(auditLogFile);
    expect(auditEntries.length).toBeGreaterThan(0);
    expect(auditEntries.some((e) => e.event === 'SYNC_COMPLETED')).toBe(true);
    expect(auditEntries.some((e) => e.event === 'DISPATCH_SUCCESS')).toBe(true);
  });

  it('handles publisher failure gracefully and logs failure in audit', async () => {
    const failingDaemon = new ContentDistributionDaemon({
      marketingDir: tmpDir,
      auditLogPath: auditLogFile,
      publisher: async () => {
        throw new Error('API Rate Limited (429)');
      },
    });

    failingDaemon.queuePost({
      id: 'fail-post',
      title: 'Will Fail',
      slug: 'will-fail',
      content: 'Failed attempt',
      tags: ['fail'],
      targetChannels: ['TWITTER'],
      author: 'Tester',
      locale: 'bilingual',
      status: 'QUEUED',
    });

    const records = await failingDaemon.dispatchQueued();
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('FAILED');
    expect(records[0].error).toContain('API Rate Limited');

    const auditEntries = await readJsonl<{ event: string }>(auditLogFile);
    expect(auditEntries.some((e) => e.event === 'DISPATCH_FAILED')).toBe(true);
  });

  it('handles non-Error publisher rejection safely', async () => {
    const rawErrorDaemon = new ContentDistributionDaemon({
      marketingDir: tmpDir,
      auditLogPath: auditLogFile,
      publisher: async () => {
        return Promise.reject('String error message');
      },
    });

    rawErrorDaemon.queuePost({
      id: 'string-fail-post',
      title: 'String Error',
      slug: 'string-error',
      content: 'Failed attempt',
      tags: ['fail'],
      targetChannels: ['TWITTER'],
      author: 'Tester',
      locale: 'bilingual',
      status: 'QUEUED',
    });

    const records = await rawErrorDaemon.dispatchQueued();
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('FAILED');
    expect(records[0].error).toBe('String error message');
  });

  it('starts and stops daemon background interval safely', () => {
    vi.useFakeTimers();
    expect(daemon.getAuditLogPath()).toBe(auditLogFile);

    daemon.startDaemon(1000);
    // Double start should be idempotent
    daemon.startDaemon(1000);

    // Fast-forward interval timer
    vi.advanceTimersByTime(1050);

    daemon.stopDaemon();
    // Double stop should be idempotent
    daemon.stopDaemon();

    vi.useRealTimers();
    expect(fs.existsSync(auditLogFile)).toBe(true);
  });
});
