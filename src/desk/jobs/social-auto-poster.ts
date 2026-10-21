/**
 * Social Media Auto-Posting Engine
 * a16z Solo Company Layer 6: System MARKETS itself on social platforms
 *
 * Formats blog posts for:
 *   - Twitter/X (API v2 via OAuth 2.0)
 *   - Telegram channel (via bot API)
 *
 * Graceful degradation when API keys not configured.
 * Runs as part of auto-marketing daemon cycle.
 *
 * Split: per-channel posting lives in social-channel-posters.ts; this module
 * owns message formatting and the distribution fan-out.
 */

import { logger } from '../../shared/utils/logger';
import type { BlogPost } from './auto-marketing-daemon';
import { postToTelegramChannel, postToTwitter } from './social-channel-posters';

/** Twitter/X hard character limit. */
const TWITTER_MAX_CHARS = 280;

/** Reserve for the trailing link line and hashtags. */
const TWITTER_RESERVED_CHARS = 30;

const TWITTER_HASHTAGS = '#PredictionMarkets #AlgoTrading #Polymarket';

/** Format a blog post for Twitter (280 char limit). */
function formatForTwitter(post: BlogPost): string {
  const maxContent = TWITTER_MAX_CHARS - TWITTER_HASHTAGS.length - TWITTER_RESERVED_CHARS;
  const excerpt = post.excerpt.slice(0, maxContent);
  return `${excerpt}\n\nhttps://cashclaw.cc/blog\n\n${TWITTER_HASHTAGS}`;
}

/** Format a blog post for Telegram channel (markdown). */
function formatForTelegram(post: BlogPost): string {
  return `*${post.title}*\n\n${post.excerpt}\n\n[Read more](https://cashclaw.cc/blog) | [Get signals](https://cashclaw.cc/#pricing)`;
}

/** Distribute a blog post to all configured social channels */
export async function distributePost(post: BlogPost): Promise<{ twitter: boolean; telegram: boolean }> {
  const results = {
    twitter: false,
    telegram: false,
  };

  results.twitter = await postToTwitter(formatForTwitter(post));
  results.telegram = await postToTelegramChannel(formatForTelegram(post));

  const platforms = [
    results.twitter ? 'Twitter' : null,
    results.telegram ? 'Telegram' : null,
  ].filter(Boolean);

  if (platforms.length > 0) {
    logger.info(`[SocialPoster] Distributed to: ${platforms.join(', ')}`);
  } else {
    logger.debug('[SocialPoster] No social platforms configured, skipping distribution');
  }

  return results;
}
