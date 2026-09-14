/**
 * Auto-Marketing Daemon
 * a16z Solo Company Layer 6: System MARKETS itself autonomously
 *
 * Generates blog content from trading signals and performance data.
 * Publishes to blog API endpoint for landing page consumption.
 * Runs on PM2 cron schedule (daily or on-demand).
 *
 * Content types:
 * - Signal digest (daily top opportunities)
 * - Performance report (weekly P&L summary)
 * - Strategy spotlight (rotating strategy deep-dives)
 * - Market analysis (trending prediction markets)
 */

import { logger } from '../../shared/utils/logger';
import { readJson, writeJson } from '../../shared/persistence/persistent-store';
import { generateLlmBlogPost } from './llm-content-generator';
import { distributePost } from './social-auto-poster';
import {
  type BlogPost,
  BLOG_POSTS_FILE,
} from './auto-marketing-daemon-types';
import {
  generateSignalDigest,
  generatePerformanceReport,
  generateStrategySpotlight,
} from './auto-marketing-daemon-core';

export * from './auto-marketing-daemon-types';
export * from './auto-marketing-daemon-core';

/** Load existing blog posts */
function loadPosts(): BlogPost[] {
  return readJson<BlogPost[]>(BLOG_POSTS_FILE) ?? [];
}

/** Save blog posts */
function savePosts(posts: BlogPost[]): void {
  writeJson(BLOG_POSTS_FILE, posts);
}

/** Run the auto-marketing daemon — generates and saves new blog content */
export async function runAutoMarketing(): Promise<void> {
  logger.info('[AutoMarketing] Starting content generation cycle');

  const posts = loadPosts();
  const today = new Date().toISOString().slice(0, 10);

  // Check if we already generated content today
  const todayPosts = posts.filter(p => p.generatedAt.startsWith(today));
  if (todayPosts.length >= 2) {
    logger.info(`[AutoMarketing] Already generated ${todayPosts.length} posts today, skipping`);
    return;
  }

  // Generate daily signal digest (LLM-enhanced with template fallback)
  const digest = await generateLlmBlogPost('signal-digest', generateSignalDigest);
  posts.unshift(digest);
  logger.info(`[AutoMarketing] Generated signal digest: ${digest.title}`);

  // Generate weekly report on Mondays
  const dayOfWeek = new Date().getDay();
  if (dayOfWeek === 1) {
    const report = await generateLlmBlogPost('performance', generatePerformanceReport);
    posts.unshift(report);
    logger.info(`[AutoMarketing] Generated weekly report: ${report.title}`);
  }

  // Generate strategy spotlight on Thursdays
  if (dayOfWeek === 4) {
    const spotlight = await generateLlmBlogPost('strategy-spotlight', generateStrategySpotlight);
    posts.unshift(spotlight);
    logger.info(`[AutoMarketing] Generated strategy spotlight: ${spotlight.title}`);
  }

  // Keep only last 50 posts
  const trimmed = posts.slice(0, 50);
  savePosts(trimmed);

  // Distribute latest post to social channels (Twitter, Telegram channel)
  const latestPost = trimmed[0];
  if (latestPost) {
    await distributePost(latestPost);
  }

  logger.info(`[AutoMarketing] Content generation + distribution complete. Total posts: ${trimmed.length}`);
}

/** Blog posts API handler — returns posts as JSON for landing page */
export function getBlogPosts(limit = 10): BlogPost[] {
  const posts = loadPosts();
  return posts.slice(0, limit);
}

// CLI entry point
export function runCli(argv: string[] = process.argv): void {
  const script = argv[1];
  if (!script?.endsWith('auto-marketing-daemon.ts') && !script?.endsWith('auto-marketing-daemon.js')) return;
  runAutoMarketing()
    .then(() => { logger.info('[AutoMarketing] Daemon cycle complete'); process.exit(0); })
    .catch((err) => { logger.error('[AutoMarketing] Daemon failed', { error: err }); process.exit(1); });
}

if (process.argv[1]?.endsWith('auto-marketing-daemon.ts') || process.argv[1]?.endsWith('auto-marketing-daemon.js')) runCli();
