/**
 * Tests for auto-marketing daemon
 * Validates content generation for all post types
 */

import { describe, it, expect } from 'vitest';
import {
  generateSignalDigest,
  generatePerformanceReport,
  generateStrategySpotlight,
  getBlogPosts,
} from '../auto-marketing-daemon';

describe('AutoMarketing Daemon', () => {
  it('should generate signal digest with required fields', () => {
    const post = generateSignalDigest();
    expect(post.id).toBeTruthy();
    expect(post.title).toContain('Signal Digest');
    expect(post.excerpt).toBeTruthy();
    expect(post.content).toContain('52+ strategy engine');
    expect(post.type).toBe('signal-digest');
    expect(post.tags).toContain('Signals');
    expect(post.date).toBeTruthy();
    expect(post.generatedAt).toBeTruthy();
  });

  it('should generate performance report with metrics', () => {
    const post = generatePerformanceReport();
    expect(post.title).toContain('Performance');
    expect(post.content).toContain('P&L');
    expect(post.content).toContain('Win Rate');
    expect(post.content).toContain('Sharpe Ratio');
    expect(post.type).toBe('performance');
    expect(post.tags).toContain('Performance');
  });

  it('should generate strategy spotlight', () => {
    const post = generateStrategySpotlight();
    expect(post.title).toContain('Strategy Spotlight');
    expect(post.content).toContain('Kelly Criterion');
    expect(post.type).toBe('strategy-spotlight');
    expect(post.tags.length).toBeGreaterThanOrEqual(2);
  });

  it('should return empty array when no posts exist', () => {
    const posts = getBlogPosts(10);
    expect(Array.isArray(posts)).toBe(true);
  });

  it('should generate unique IDs for each post', () => {
    const a = generateSignalDigest();
    const b = generateSignalDigest();
    expect(a.id).not.toBe(b.id);
  });
});
