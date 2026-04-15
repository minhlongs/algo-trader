/**
 * LLM Content Generator
 * Generates blog content via LlmRouter (DeepSeek R1 / Nemotron / cloud fallback).
 * Reads real paper trading data from data/paper-pnl.json when available.
 * Falls back to template content when LLM is unavailable.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LlmRouter, ChatMessage } from '../lib/llm-router.js';
import { logger } from '../utils/logger.js';
import type { BlogPost } from './auto-marketing-daemon.js';

const PAPER_PNL_FILE = join(process.cwd(), 'data', 'paper-pnl.json');

interface PaperTrade {
  market: string;
  side: string;
  entry: number;
  exit?: number;
  pnl?: number;
  edge?: number;
  strategy?: string;
  timestamp?: string;
}

/** Load real paper trading data if available */
function loadPaperData(): PaperTrade[] {
  if (!existsSync(PAPER_PNL_FILE)) return [];
  try {
    const raw = JSON.parse(readFileSync(PAPER_PNL_FILE, 'utf-8'));
    return Array.isArray(raw) ? raw : raw.trades || [];
  } catch {
    return [];
  }
}

/** Build trading context summary from paper data */
function buildTradingContext(trades: PaperTrade[]): string {
  if (trades.length === 0) {
    return 'Paper trading data not yet available. Use general CashClaw capabilities (52+ strategies, 5 platforms, Kelly Criterion sizing) as context.';
  }
  const recent = trades.slice(-20);
  const totalPnl = recent.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const wins = recent.filter(t => (t.pnl || 0) > 0).length;
  const winRate = recent.length > 0 ? ((wins / recent.length) * 100).toFixed(1) : '0';
  const strategies = [...new Set(recent.map(t => t.strategy).filter(Boolean))];
  return `Recent ${recent.length} trades: P&L $${totalPnl.toFixed(2)}, win rate ${winRate}%, strategies: ${strategies.join(', ') || 'mixed'}. Markets: ${recent.map(t => t.market).slice(0, 5).join(', ')}.`;
}

/** Generate a blog post using LLM with real trading context */
export async function generateLlmBlogPost(
  type: BlogPost['type'],
  fallbackGenerator: () => BlogPost
): Promise<BlogPost> {
  const trades = loadPaperData();
  const context = buildTradingContext(trades);

  const prompts: Record<BlogPost['type'], string> = {
    'signal-digest': `Write a concise daily signal digest blog post for CashClaw, a prediction market analytics platform. Context: ${context}. Include: top opportunities found today, edge ranges, active strategies. Tone: professional, data-driven, not hype. End with "Not financial advice." Keep under 300 words. Format as markdown.`,
    'performance': `Write a weekly performance report blog post for CashClaw. Context: ${context}. Include: P&L summary, win rate, strategy breakdown, notable trades. Label as "[Paper Trading]" results. Tone: honest, data-focused. Keep under 300 words. Format as markdown.`,
    'strategy-spotlight': `Write a strategy spotlight blog post about one of CashClaw's prediction market strategies. Pick from: Endgame (buy near-certain outcomes), Whale Copy-Trading, Neg-Risk Multi-Outcome, Cross-Market Arbitrage. Explain how it works, why it has edge, and how CashClaw implements it with Kelly Criterion. Keep under 300 words. Format as markdown.`,
    'market-analysis': `Write a brief prediction market analysis for CashClaw's blog. Cover: current market conditions across Polymarket/Kalshi/Limitless, liquidity trends, where opportunities exist. Context: ${context}. Keep under 300 words. Format as markdown.`,
  };

  try {
    const router = new LlmRouter();
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a content writer for CashClaw, an AI-powered prediction market analytics platform. Write SEO-friendly blog posts. Never fabricate specific dollar amounts or win rates — use "[Paper Trading]" prefix for any performance claims. No emojis.' },
      { role: 'user', content: prompts[type] },
    ];

    const response = await router.fastChat({ messages, maxTokens: 1024, temperature: 0.7 });

    if (!response.content || response.content.length < 50) {
      throw new Error('LLM response too short');
    }

    // Parse LLM output into BlogPost
    const lines = response.content.split('\n').filter(l => l.trim());
    const title = (lines[0] || '').replace(/^#+\s*/, '').trim() || fallbackGenerator().title;
    const excerpt = lines.slice(1, 3).join(' ').slice(0, 200).trim();

    logger.info(`[LLMContent] Generated ${type} via ${response.provider}/${response.model} (${response.latencyMs}ms)`);

    return {
      id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      excerpt: excerpt || fallbackGenerator().excerpt,
      content: response.content,
      date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      tags: fallbackGenerator().tags,
      type,
      url: '#',
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn(`[LLMContent] LLM unavailable for ${type}, using template fallback`, { error: err instanceof Error ? err.message : err });
    const fallback = fallbackGenerator();
    fallback.type = type; // Ensure type matches requested type
    return fallback;
  }
}
