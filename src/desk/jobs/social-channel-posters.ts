/**
 * Social Channel Posters
 *
 * One poster per social channel, each degrading to `false` when its credentials
 * are absent or its API rejects the request. Extracted from the auto-posting
 * engine so channel credentials and rate-limit handling stay per-channel, and
 * distribution stays about distribution.
 */

import { logger } from '../../shared/utils/logger';

/** Twitter/X post via API v2 (OAuth 1.0a User Context for write operations). */
export async function postToTwitter(text: string): Promise<boolean> {
  const apiKey = process.env.TWITTER_API_KEY;
  const apiSecret = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    logger.debug('[SocialPoster] Twitter OAuth credentials incomplete, skipping');
    return false;
  }

  try {
    const { createHmac, randomBytes } = await import('node:crypto');

    const oauthNonce = randomBytes(16).toString('hex');
    const oauthTimestamp = Math.floor(Date.now() / 1000).toString();
    const url = 'https://api.twitter.com/2/tweets';

    // OAuth 1.0a signature: percent-encoded sorted params over POST&url&params,
    // signed with HMAC-SHA1 under "<consumer secret>&<token secret>".
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

/** Post to a Telegram channel via the bot API. */
export async function postToTelegramChannel(text: string): Promise<boolean> {
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
