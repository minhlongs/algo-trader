/**
 * Migration 035: Blog Engagement Tables
 * Adds comment system + A/B testing tables for Phase 34b Content Personalization.
 */
import { PoolClient } from 'pg';

export const id = '035-add-blog-engagement-tables';
export const description =
  'Create blog_comments and blog_ab_tests tables for content personalization';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS blog_comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id TEXT NOT NULL,
      author_name TEXT NOT NULL DEFAULT 'Anonymous',
      author_email TEXT,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      moderation_reason TEXT,
      moderation_score REAL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_blog_comments_post_id ON blog_comments(post_id, created_at DESC)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_blog_comments_status ON blog_comments(status)
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS blog_ab_tests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id TEXT NOT NULL,
      title_a TEXT NOT NULL,
      title_b TEXT NOT NULL,
      excerpt_a TEXT NOT NULL,
      excerpt_b TEXT NOT NULL,
      impressions_a INTEGER NOT NULL DEFAULT 0,
      impressions_b INTEGER NOT NULL DEFAULT 0,
      clicks_a INTEGER NOT NULL DEFAULT 0,
      clicks_b INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','stopped')),
      winner TEXT CHECK (winner IS NULL OR winner IN ('A','B','tie')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_blog_ab_tests_post_id ON blog_ab_tests(post_id)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS blog_ab_tests');
  await client.query('DROP TABLE IF EXISTS blog_comments');
}
