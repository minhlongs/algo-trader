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
 */

import { logger } from '../../shared/utils/logger';
import type { BlogPost } from './auto-marketing-daemon';

/** Twitter/X post via API v2 (OAuth 2.0 Bearer Token) */
async function postToTwitter(text: string): Promise<boolean> {
  const apiKey = process.env.TWITTER_API_KEY;
  const apiSecret = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    logger.debug('[SocialPoster] Twitter OAuth credentials incomplete, skipping');
    return false;
  }

  try {
    // Use OAuth 1.0a User Context for posting tweets
    // Twitter API v2 requires OAuth 1.0a for write operations
    const { createHmac, randomBytes } = await import('node:crypto');

    const oauthNonce = randomBytes(16).toString('hex');
    const oauthTimestamp = Math.floor(Date.now() / 1000).toString();
    const url = 'https://api.twitter.com/2/tweets';

    // Build OAuth signature
    const params: Record<string, string> = {
      oauth_consumer_key: apiKey || '',
      oauth_nonce: oauthNonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: oauthTimestamp,
      oauth_token: accessToken || '',
      oauth_version: '1.0',
    };

    const paramString = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const signatureBase = `POST&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`;
    const signingKey = `${encodeURIComponent(apiSecret || '')}&${encodeURIComponent(accessSecret || '')}`;
    const oauthSignature = createHmac('sha1', signingKey).update(signatureBase).digest('base64');

    const authHeader = `OAuth ${Object.entries({
      ...params,
      oauth_signature: oauthSignature,
    }).map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`).join(', ')}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      logger.warn(`[SocialPoster] Twitter API error: ${res.status} ${errBody}`);
      return false;
    }

    logger.info('[SocialPoster] Posted to Twitter successfully');
    return true;
  } catch (err) {
    logger.warn('[SocialPoster] Twitter post failed', { error: err instanceof Error ? err.message : err });
    return false;
  }
}

/** Post to Telegram channel via bot API */
async function postToTelegramChannel(text: string): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const channelId = process.env.TELEGRAM_CHANNEL_ID;

  if (!botToken || !channelId) {
    logger.debug('[SocialPoster] Telegram channel not configured, skipping');
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      }),
    });

    if (!res.ok) {
      logger.warn(`[SocialPoster] Telegram channel error: ${res.status} ${res.statusText}`);
      return false;
    }

    logger.info('[SocialPoster] Posted to Telegram channel');
    return true;
  } catch (err) {
    logger.warn('[SocialPoster] Telegram channel post failed', { error: err instanceof Error ? err.message : err });
    return false;
  }
}

/** Format a blog post for Twitter (280 char limit) */
function formatForTwitter(post: BlogPost): string {
  const hashtags = '#PredictionMarkets #AlgoTrading #Polymarket';
  const maxContent = 280 - hashtags.length - 30; // room for link + hashtags
  const excerpt = post.excerpt.slice(0, maxContent);
  return `${excerpt}\n\nhttps://cashclaw.cc/blog\n\n${hashtags}`;
}

/** Format a blog post for Telegram channel (markdown) */
function formatForTelegram(post: BlogPost): string {
  return `*${post.title}*\n\n${post.excerpt}\n\n[Read more](https://cashclaw.cc/blog) | [Get signals](https://cashclaw.cc/#pricing)`;
}

/** Distribute a blog post to all configured social channels */
export async function distributePost(post: BlogPost): Promise<{ twitter: boolean; telegram: boolean }> {
  const results = {
    twitter: false,
    telegram: false,
  };

  // Post to Twitter
  results.twitter = await postToTwitter(formatForTwitter(post));

  // Post to Telegram channel
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
