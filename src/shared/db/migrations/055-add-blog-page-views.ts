/**
 * Migration 055: Blog Page View Analytics
 * Phase 34 Content Personalization — tracks page views and time-on-page
 * per blog post for engagement analytics and A/B test CTR measurement.
 */
import { PoolClient } from 'pg';

export const id = '055-add-blog-page-views';
export const description =
  'Create blog_page_views table for page-view + time-on-page analytics';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS blog_page_views (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id TEXT NOT NULL,
      viewer_id TEXT,
      referrer TEXT,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      view_duration_ms INTEGER NOT NULL DEFAULT 0,
      viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_blog_page_views_post_id ON blog_page_views(post_id, viewed_at DESC)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_blog_page_views_viewed_at ON blog_page_views(viewed_at)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_blog_page_views_viewer ON blog_page_views(viewer_id)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS blog_page_views');
}
