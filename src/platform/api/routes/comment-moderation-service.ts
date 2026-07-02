/**
 * Comment Moderation Service
 * Uses LLM to check comments for spam, abuse, or policy violations.
 * Falls back to keyword-based detection if LLM is unavailable.
 */
import { LlmRouter, ChatMessage } from '../../../lib/llm-router';
import { logger } from '../../../shared/utils/logger';

export interface ModerationResult {
  approved: boolean;
  reason?: string;
  confidenceScore: number; // 0–10, higher = more confident in decision
}

const BLOCKED_PATTERNS = [
  /\b(viagra|cialis|casino|porn|xxx|sex|dating)\b/i,
  /https?:\/\/[^\s]{3,}\.ru\b/i,  // .ru spam domains
  /\b(buy now|click here|free money|earn \$\d+|make \$\d+)\b/i,
  /<script\b/i,                   // XSS attempt
  /\b(fuck|shit|asshole|bastard)\b/i, // profanity filter
];

/** Fast keyword-based moderation as fallback */
function keywordModeration(content: string): ModerationResult {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(content)) {
      return { approved: false, reason: `Matched blocked pattern: ${pattern.source}`, confidenceScore: 8 };
    }
  }
  // Short comments with little substance
  if (content.trim().length < 3) {
    return { approved: false, reason: 'Comment too short', confidenceScore: 9 };
  }
  return { approved: true, confidenceScore: 5 };
}

/** LLM-based comment moderation */
export async function moderateComment(content: string, authorName: string): Promise<ModerationResult> {
  try {
    const router = new LlmRouter();
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You moderate blog comments. Reply with ONLY a JSON object: {"approved":true|false,"reason":"brief explanation","confidence":1-10}

Rules:
- Reject: spam, scams, malware links, hate speech, threats, harassment, NSFW
- Reject: comments clearly written by bots or containing gibberish
- Approve: genuine questions, feedback, constructive criticism, relevant trading discussion
- Comments about prediction markets, trading strategies, or platform feedback are ON-TOPIC`,
      },
      {
        role: 'user',
        content: `Author: "${authorName}"\nComment: "${content.slice(0, 500)}"`,
      },
    ];

    const response = await router.fastChat({ messages, maxTokens: 128, temperature: 0.1 });

    if (response.content) {
      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            approved: parsed.approved === true,
            reason: parsed.reason,
            confidenceScore: typeof parsed.confidence === 'number' ? parsed.confidence : 5,
          };
        }
      } catch {
        // Parse failed, fall through to keyword check
      }
    }

    // LLM returned unusable output, fallback
    logger.warn('[CommentModeration] LLM returned unparseable output, falling back to keyword check');
    return keywordModeration(content);
  } catch (err) {
    logger.warn('[CommentModeration] LLM unavailable, using keyword moderation', {
      error: err instanceof Error ? err.message : err,
    });
    return keywordModeration(content);
  }
}
