/**
 * Resend Edge Email Provider Adapter
 * Native fetch-based transactional email delivery for Node.js and Cloudflare Workers.
 */

import type { CampaignEmailPayload } from '../../agentic/types/campaign-types';
import type { EmailSenderFn } from '../../agentic/campaign-runner';
import { logger } from '../../shared/utils/logger';

export interface ResendSenderOptions {
  apiKey?: string;
  fromEmail?: string;
  fetchFn?: typeof fetch;
  maxRetries?: number;
}

export function sanitizeResendSecret(input: string): string {
  return input
    .replace(/bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/re_[a-zA-Z0-9_\-.]{20,}/g, '[REDACTED_RESEND_KEY]')
    .replace(/(api[-_]?key|secret)=([^&\s]+)/gi, '$1=[REDACTED]');
}

export function createResendSender(
  apiKeyOrOptions?: string | ResendSenderOptions,
  customFromEmail?: string
): EmailSenderFn {
  const opts: ResendSenderOptions =
    typeof apiKeyOrOptions === 'object' && apiKeyOrOptions !== null
      ? apiKeyOrOptions
      : { apiKey: apiKeyOrOptions, fromEmail: customFromEmail };

  const apiKey = opts.apiKey || process.env.RESEND_API_KEY || '';
  const fromEmail = opts.fromEmail || process.env.RESEND_FROM_EMAIL || 'no-reply@algo-trader.com';
  const fetchImpl = opts.fetchFn || globalThis.fetch;
  const maxRetries = opts.maxRetries ?? 2;

  if (!apiKey) {
    logger.warn('[ResendProvider] RESEND_API_KEY is not configured');
  }

  return async (payload: CampaignEmailPayload): Promise<{ messageId: string }> => {
    if (!apiKey) {
      throw new Error('Resend API key is missing. Set RESEND_API_KEY in environment or config.');
    }

    const body = JSON.stringify({
      from: fromEmail,
      to: [payload.to],
      subject: payload.subject,
      html: payload.htmlBody,
      text: payload.textBody || undefined,
    });

    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        const response = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body,
        });

        if (response.status === 429 && attempt < maxRetries) {
          attempt++;
          const retryAfter = Number(response.headers.get('retry-after')) || 1;
          await new Promise((r) => setTimeout(r, retryAfter * 50));
          continue;
        }

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Resend API error (${response.status}): ${sanitizeResendSecret(errText)}`);
        }

        const data = (await response.json()) as { id?: string };
        if (!data.id) {
          throw new Error('Resend API returned response without message ID');
        }

        return { messageId: data.id };
      } catch (err: unknown) {
        if (attempt >= maxRetries) {
          const rawMessage = err instanceof Error ? err.message : String(err);
          const sanitizedMessage = sanitizeResendSecret(rawMessage);
          logger.error('[ResendProvider] Dispatch failed:', { error: sanitizedMessage });
          throw new Error(sanitizedMessage);
        }
        attempt++;
        await new Promise((r) => setTimeout(r, 50 * attempt));
      }
    }

    throw new Error('Failed to send email via Resend after retries');
  };
}
