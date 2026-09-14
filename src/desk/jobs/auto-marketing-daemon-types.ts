/**
 * Types and file paths for Auto-Marketing Daemon.
 */

import { join } from 'node:path';

export const BLOG_DATA_DIR = join(process.cwd(), 'data', 'blog');
export const BLOG_POSTS_FILE = join(BLOG_DATA_DIR, 'posts.json');

export interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  date: string;
  tags: string[];
  type: 'signal-digest' | 'performance' | 'strategy-spotlight' | 'market-analysis' | 'launch-announcement';
  url: string;
  generatedAt: string;
}

/** Generate a unique post ID */
export function generateId(): string {
  return `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Format date for display */
export function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
