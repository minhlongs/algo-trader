/**
 * LLM Content Generator Tests
 * Covers: loadPaperData, buildTradingContext, generateLlmBlogPost (all branches)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateLlmBlogPost } from '../llm-content-generator';
import { generateSignalDigest, generatePerformanceReport, generateStrategySpotlight } from '../auto-marketing-daemon';
import { readJson } from '../../../shared/persistence/persistent-store';

// Mock dependencies
vi.mock('../../../lib/llm-router', () => {
  const createMockResponse = (content: string, shouldFail = false) => {
    if (shouldFail) {
      throw new Error('LLM unavailable');
    }
    return {
      content,
      provider: 'mock',
      model: 'mock-model',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      latencyMs: 1,
    };
  };

  const mockFastChat = vi.fn();
  const MockLlmRouter = vi.fn(function () {
    this.fastChat = mockFastChat;
  } as any);

  return {
    LlmRouter: MockLlmRouter,
    ChatMessage: class ChatMessage {},
    __mockFastChat: mockFastChat,
    __createMockResponse: createMockResponse,
  };
});

vi.mock('../../../shared/persistence/persistent-store', () => ({
  readJson: vi.fn(),
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from '../../../shared/utils/logger';
import { LlmRouter } from '../../../lib/llm-router';

describe('LLM Content Generator', () => {
  let mockFastChat: ReturnType<typeof vi.fn>;
  let mockReadJson: ReturnType<typeof vi.fn>;
  let mockLogger: typeof logger;

  beforeEach(() => {
    vi.clearAllMocks();

    // Get access to mocked functions
    const llmRouterModule = vi.mocked(LlmRouter);
    const routerInstance = new llmRouterModule();
    mockFastChat = (routerInstance as any).fastChat;
    mockFastChat.mockReset();

    mockReadJson = vi.mocked(readJson);
    mockLogger = vi.mocked(logger);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // loadPaperData tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('loadPaperData (via generateLlmBlogPost)', () => {
    it('should return empty array when readJson returns null', async () => {
      mockReadJson.mockReturnValue(null);
      mockFastChat.mockResolvedValue({
        content: '# Test\nContent here',
        provider: 'mock',
        model: 'mock-model',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        latencyMs: 1,
      });

      const post = await generateLlmBlogPost('signal-digest', generateSignalDigest);
      expect(post.id).toBeTruthy();
    });

    it('should return trades array when readJson returns array', async () => {
      const trades = [
        { market: 'BTC', side: 'BUY', entry: 0.5, exit: 0.6, pnl: 10, edge: 0.1, strategy: 'test', timestamp: '2024-01-01' },
        { market: 'ETH', side: 'SELL', entry: 0.4, exit: 0.35, pnl: 5, edge: 0.05, strategy: 'test', timestamp: '2024-01-02' },
      ];
      mockReadJson.mockReturnValue(trades);
      mockFastChat.mockResolvedValue({
        content: '# Test\nContent here',
        provider: 'mock',
        model: 'mock-model',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        latencyMs: 1,
      });

      const post = await generateLlmBlogPost('signal-digest', generateSignalDigest);
      expect(post.id).toBeTruthy();
    });

    it('should return trades from object.trades when readJson returns object with trades', async () => {
      const trades = [
        { market: 'BTC', side: 'BUY', entry: 0.5, pnl: 10, strategy: 'endgame', timestamp: '2024-01-01' },
      ];
      mockReadJson.mockReturnValue({ trades });
      mockFastChat.mockResolvedValue({
        content: '# Test\nContent here',
        provider: 'mock',
        model: 'mock-model',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        latencyMs: 1,
      });

      const post = await generateLlmBlogPost('signal-digest', generateSignalDigest);
      expect(post.id).toBeTruthy();
    });

    it('should return empty array when readJson returns object without trades', async () => {
      mockReadJson.mockReturnValue({ other: 'data' });
      mockFastChat.mockResolvedValue({
        content: '# Test\nContent here',
        provider: 'mock',
        model: 'mock-model',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        latencyMs: 1,
      });

      const post = await generateLlmBlogPost('signal-digest', generateSignalDigest);
      expect(post.id).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // buildTradingContext tests (exercised through generateLlmBlogPost)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('buildTradingContext (via generateLlmBlogPost)', () => {
    it('should use fallback context when no trades available', async () => {
      mockReadJson.mockReturnValue([]);
      mockFastChat.mockResolvedValue({
        content: '# Test\nContent here',
        provider: 'mock',
        model: 'mock-model',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        latencyMs: 1,
      });

      await generateLlmBlogPost('signal-digest', generateSignalDigest);
      const prompt = mockFastChat.mock.calls[0][0].messages[1].content;
      expect(prompt).toContain('Paper trading data not yet available');
    });

    it('should build context from recent trades (last 20)', async () => {
      // Create 25 trades to test slice(-20)
      const trades = Array.from({ length: 25 }, (_, i) => ({
        market: `MARKET${i}`,
        side: 'BUY',
        entry: 0.5,
        exit: 0.6,
        pnl: i % 2 === 0 ? 10 : -5,
        edge: 0.1,
        strategy: `strat${i % 3}`,
        timestamp: `2024-01-${String(i + 1).padStart(2, '0')}`,
      }));
      mockReadJson.mockReturnValue(trades);
      mockFastChat.mockResolvedValue({
        content: '# Test\nContent here',
        provider: 'mock',
        model: 'mock-model',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        latencyMs: 1,
      });

      await generateLlmBlogPost('signal-digest', generateSignalDigest);
      const prompt = mockFastChat.mock.calls[0][0].messages[1].content;
      expect(prompt).toContain('Recent 20 trades');
    });

    it('should calculate correct P&L and win rate', async () => {
      const trades = [
        { market: 'BTC', side: 'BUY', entry: 0.5, exit: 0.6, pnl: 100, edge: 0.1, strategy: 'endgame', timestamp: '2024-01-01' },
        { market: 'ETH', side: 'BUY', entry: 0.4, exit: 0.35, pnl: -50, edge: 0.05, strategy: 'whale', timestamp: '2024-01-02' },
        { market: 'SOL', side: 'BUY', entry: 0.3, exit: 0.4, pnl: 25, edge: 0.08, strategy: 'endgame', timestamp: '2024-01-03' },
      ];
      mockReadJson.mockReturnValue(trades);
      mockFastChat.mockResolvedValue({
        content: '# Test\nContent here',
        provider: 'mock',
        model: 'mock-model',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        latencyMs: 1,
      });

      await generateLlmBlogPost('signal-digest', generateSignalDigest);
      const prompt = mockFastChat.mock.calls[0][0].messages[1].content;
      // Total P&L = 75, wins = 2/3 = 66.7%
      expect(prompt).toContain('75.00');
      expect(prompt).toContain('66.7%');
      expect(prompt).toContain('endgame, whale');
    });

    it('should handle trades with missing optional fields', async () => {
      const trades = [
        { market: 'BTC', side: 'BUY', entry: 0.5 }, // minimal trade
      ];
      mockReadJson.mockReturnValue(trades);
      mockFastChat.mockResolvedValue({
        content: '# Test\nContent here',
        provider: 'mock',
        model: 'mock-model',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        latencyMs: 1,
      });

      await generateLlmBlogPost('signal-digest', generateSignalDigest);
      const prompt = mockFastChat.mock.calls[0][0].messages[1].content;
      expect(prompt).toContain('Recent 1 trades');
      expect(prompt).toContain('P&L $0.00');
    });

    it('should handle trades with undefined pnl gracefully', async () => {
      const trades = [
        { market: 'BTC', side: 'BUY', entry: 0.5, pnl: undefined },
        { market: 'ETH', side: 'SELL', entry: 0.4, pnl: null as any },
      ];
      mockReadJson.mockReturnValue(trades);
      mockFastChat.mockResolvedValue({
        content: '# Test\nContent here',
        provider: 'mock',
        model: 'mock-model',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        latencyMs: 1,
      });

      await generateLlmBlogPost('signal-digest', generateSignalDigest);
      const prompt = mockFastChat.mock.calls[0][0].messages[1].content;
      expect(prompt).toContain('P&L $0.00');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // generateLlmBlogPost - LLM Success Path
  // ═══════════════════════════════════════════════════════════════════════════

  describe('generateLlmBlogPost - LLM Success', () => {
    const successResponse = {
      content: '# Test Title\n\nThis is the body content of the blog post with enough words to pass the 50 character minimum check.',
      provider: 'deepseek',
      model: 'deepseek-r1',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      latencyMs: 500,
    };

    beforeEach(() => {
      mockFastChat.mockResolvedValue(successResponse);
    });

    it('should generate signal-digest post', async () => {
      mockReadJson.mockReturnValue([]);
      const post = await generateLlmBlogPost('signal-digest', generateSignalDigest);
      expect(post.type).toBe('signal-digest');
      expect(post.title).toBe('Test Title');
      expect(post.content).toContain('Test Title');
    });

    it('should generate performance report post', async () => {
      mockReadJson.mockReturnValue([]);
      const post = await generateLlmBlogPost('performance', generatePerformanceReport);
      expect(post.type).toBe('performance');
    });

    it('should generate strategy-spotlight post', async () => {
      mockReadJson.mockReturnValue([]);
      const post = await generateLlmBlogPost('strategy-spotlight', generateStrategySpotlight);
      expect(post.type).toBe('strategy-spotlight');
    });

    it('should generate market-analysis post', async () => {
      mockReadJson.mockReturnValue([]);
      const post = await generateLlmBlogPost('market-analysis', generateSignalDigest);
      expect(post.type).toBe('market-analysis');
    });

    it('should generate launch-announcement post', async () => {
      mockReadJson.mockReturnValue([]);
      const post = await generateLlmBlogPost('launch-announcement', generateSignalDigest);
      expect(post.type).toBe('launch-announcement');
    });

    it('should log successful generation', async () => {
      mockReadJson.mockReturnValue([]);
      await generateLlmBlogPost('signal-digest', generateSignalDigest);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('[LLMContent] Generated signal-digest via deepseek/deepseek-r1')
      );
    });

    it('should use fallback title when LLM response has no title line', async () => {
      mockFastChat.mockResolvedValue({
        ...successResponse,
        content: 'No title line here\nJust body content',
      });
      mockReadJson.mockReturnValue([]);

      const fallback = generateSignalDigest();
      const post = await generateLlmBlogPost('signal-digest', generateSignalDigest);
      expect(post.title).toBe(fallback.title);
    });

    it('should use fallback excerpt when LLM response has insufficient lines', async () => {
      mockFastChat.mockResolvedValue({
        ...successResponse,
        content: '# Title Only',
      });
      mockReadJson.mockReturnValue([]);

      const post = await generateLlmBlogPost('signal-digest', generateSignalDigest);
      expect(post.excerpt).toBeTruthy();
      expect(typeof post.excerpt).toBe('string');
    });

    it('should set all BlogPost fields correctly', async () => {
      mockReadJson.mockReturnValue([]);
      const post = await generateLlmBlogPost('signal-digest', generateSignalDigest);
      expect(post.id).toMatch(/^post-\d+-[a-z0-9]{6}$/);
      expect(post.date).toBeDefined();
      expect(post.tags).toEqual(generateSignalDigest().tags);
      expect(post.url).toBe('#');
      expect(post.generatedAt).toBeDefined();
    });

    it('should use fallback title and excerpt when LLM content is all whitespace', async () => {
      mockReadJson.mockReturnValue([]);
      // 60 spaces: passes the >=50 char check but yields zero parseable lines
      mockFastChat.mockResolvedValue({
        content: ' '.repeat(60),
        provider: 'mock',
        model: 'mock',
        finishReason: 'stop',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
      });

      const fallback = generateSignalDigest();
      const post = await generateLlmBlogPost('signal-digest', generateSignalDigest);
      expect(post.title).toBe(fallback.title);
      expect(post.excerpt).toBeTruthy();
      expect(typeof post.excerpt).toBe('string');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // generateLlmBlogPost - LLM Failure / Fallback Path
  // ═══════════════════════════════════════════════════════════════════════════

  describe('generateLlmBlogPost - LLM Failure Fallback', () => {
    it('should fallback when LLM throws error', async () => {
      mockReadJson.mockReturnValue([]);
      mockFastChat.mockRejectedValue(new Error('Network error'));

      const post = await generateLlmBlogPost('signal-digest', generateSignalDigest);
      expect(post.type).toBe('signal-digest');
      expect(post.content).toContain('Signal Digest'); // fallback content
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[LLMContent] LLM unavailable for signal-digest'),
        expect.any(Object)
      );
    });

    it('should fallback when LLM response is too short', async () => {
      mockReadJson.mockReturnValue([]);
      mockFastChat.mockResolvedValue({
        content: 'Short', // < 50 chars
        provider: 'mock',
        model: 'mock',
        finishReason: 'stop',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
      });

      const post = await generateLlmBlogPost('signal-digest', generateSignalDigest);
      expect(post.type).toBe('signal-digest');
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should fallback when LLM returns empty content', async () => {
      mockReadJson.mockReturnValue([]);
      mockFastChat.mockResolvedValue({
        content: '',
        provider: 'mock',
        model: 'mock',
        finishReason: 'stop',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
      });

      const post = await generateLlmBlogPost('signal-digest', generateSignalDigest);
      expect(post.type).toBe('signal-digest');
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should fallback when LLM returns undefined content', async () => {
      mockReadJson.mockReturnValue([]);
      mockFastChat.mockResolvedValue({
        content: undefined as any,
        provider: 'mock',
        model: 'mock',
        finishReason: 'stop',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
      });

      const post = await generateLlmBlogPost('signal-digest', generateSignalDigest);
      expect(post.type).toBe('signal-digest');
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should preserve requested type in fallback', async () => {
      mockReadJson.mockReturnValue([]);
      mockFastChat.mockRejectedValue(new Error('LLM down'));

      const post = await generateLlmBlogPost('market-analysis', generateSignalDigest);
      expect(post.type).toBe('market-analysis');
    });

    it('should use correct fallback generator for each type', async () => {
      mockReadJson.mockReturnValue([]);
      mockFastChat.mockRejectedValue(new Error('LLM down'));

      const signalPost = await generateLlmBlogPost('signal-digest', generateSignalDigest);
      expect(signalPost.title).toBeTruthy();
      expect(signalPost.type).toBe('signal-digest');

      const perfPost = await generateLlmBlogPost('performance', generatePerformanceReport);
      expect(perfPost.title).toBeTruthy();
      expect(perfPost.type).toBe('performance');

      const stratPost = await generateLlmBlogPost('strategy-spotlight', generateStrategySpotlight);
      expect(stratPost.title).toBeTruthy();
      expect(stratPost.type).toBe('strategy-spotlight');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // generateLlmBlogPost - Error Handling Edge Cases
  // ═══════════════════════════════════════════════════════════════════════════

  describe('generateLlmBlogPost - Edge Cases', () => {
    it('should handle non-Error throwables', async () => {
      mockReadJson.mockReturnValue([]);
      mockFastChat.mockRejectedValue('string error');

      const post = await generateLlmBlogPost('signal-digest', generateSignalDigest);
      expect(post.type).toBe('signal-digest');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[LLMContent] LLM unavailable'),
        expect.objectContaining({ error: 'string error' })
      );
    });

    it('should handle null throwable', async () => {
      mockReadJson.mockReturnValue([]);
      mockFastChat.mockRejectedValue(null);

      const post = await generateLlmBlogPost('signal-digest', generateSignalDigest);
      expect(post.type).toBe('signal-digest');
    });

    it('should handle LLM router instantiation failure', async () => {
      mockReadJson.mockReturnValue([]);
      // Simulate router creation failure by making fastChat reject
      mockFastChat.mockRejectedValue(new Error('Constructor failed'));

      const post = await generateLlmBlogPost('signal-digest', generateSignalDigest);
      expect(post.type).toBe('signal-digest');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Integration - All Post Types with Real Trading Data
  // ═══════════════════════════════════════════════════════════════════════════

  describe('generateLlmBlogPost - Integration with Real Data', () => {
    const trades = [
      { market: 'BTC-USD', side: 'YES', entry: 0.52, exit: 0.60, pnl: 80, edge: 0.15, strategy: 'endgame', timestamp: '2024-01-15' },
      { market: 'ETH-USD', side: 'NO', entry: 0.48, exit: 0.40, pnl: 40, edge: 0.10, strategy: 'whale-copy', timestamp: '2024-01-16' },
      { market: 'SOL-USD', side: 'YES', entry: 0.55, exit: 0.50, pnl: -25, edge: 0.05, strategy: 'neg-risk', timestamp: '2024-01-17' },
    ];

    const longContent = (title: string) => `${title}\n\nThis is a comprehensive blog post with enough content to pass the minimum length check. CashClaw delivers data-driven insights.`;

    it('should include trading context in signal-digest prompt', async () => {
      mockReadJson.mockReturnValue(trades);
      mockFastChat.mockResolvedValue({
        content: longContent('Signal Digest'),
        provider: 'mock',
        model: 'mock',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        latencyMs: 1,
      });

      const post = await generateLlmBlogPost('signal-digest', generateSignalDigest);
      expect(post.content).toContain('Signal Digest');
    });

    it('should include trading context in performance prompt', async () => {
      mockReadJson.mockReturnValue(trades);
      mockFastChat.mockResolvedValue({
        content: longContent('Performance Report'),
        provider: 'mock',
        model: 'mock',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        latencyMs: 1,
      });

      const post = await generateLlmBlogPost('performance', generatePerformanceReport);
      expect(post.content).toContain('Performance Report');
    });

    it('should include trading context in strategy-spotlight prompt', async () => {
      mockReadJson.mockReturnValue(trades);
      mockFastChat.mockResolvedValue({
        content: longContent('Strategy Spotlight'),
        provider: 'mock',
        model: 'mock',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        latencyMs: 1,
      });

      const post = await generateLlmBlogPost('strategy-spotlight', generateStrategySpotlight);
      expect(post.content).toContain('Strategy Spotlight');
    });

    it('should include trading context in market-analysis prompt', async () => {
      mockReadJson.mockReturnValue(trades);
      mockFastChat.mockResolvedValue({
        content: longContent('Market Analysis'),
        provider: 'mock',
        model: 'mock',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        latencyMs: 1,
      });

      const post = await generateLlmBlogPost('market-analysis', generateSignalDigest);
      expect(post.title).toContain('Market Analysis');
    });

    it('should include trading context in launch-announcement prompt', async () => {
      mockReadJson.mockReturnValue(trades);
      mockFastChat.mockResolvedValue({
        content: longContent('Launch Announcement'),
        provider: 'mock',
        model: 'mock',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        latencyMs: 1,
      });

      const post = await generateLlmBlogPost('launch-announcement', generateSignalDigest);
      expect(post.title).toContain('Launch Announcement');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LlmRouter interaction tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('LlmRouter interaction', () => {
    it('should call fastChat with correct messages structure', async () => {
      mockReadJson.mockReturnValue([]);
      mockFastChat.mockResolvedValue({
        content: '# Test\n\nBody content here',
        provider: 'mock',
        model: 'mock',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        latencyMs: 1,
      });

      await generateLlmBlogPost('signal-digest', generateSignalDigest);

      expect(mockFastChat).toHaveBeenCalled();
      const call = mockFastChat.mock.calls[0][0];
      expect(call.messages).toHaveLength(2);
      expect(call.messages[0].role).toBe('system');
      expect(call.messages[1].role).toBe('user');
      expect(call.maxTokens).toBe(1024);
      expect(call.temperature).toBe(0.7);
    });

    it('should include trading context in user prompt', async () => {
      mockReadJson.mockReturnValue([
        { market: 'BTC', side: 'BUY', entry: 0.5, pnl: 10, strategy: 'endgame', timestamp: '2024-01-01' },
      ]);
      mockFastChat.mockResolvedValue({
        content: '# Test\n\nBody content here',
        provider: 'mock',
        model: 'mock',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        latencyMs: 1,
      });

      await generateLlmBlogPost('signal-digest', generateSignalDigest);

      expect(mockFastChat).toHaveBeenCalled();
      const call = mockFastChat.mock.calls[0][0];
      expect(call.messages[1].content).toContain('Recent 1 trades');
      expect(call.messages[1].content).toContain('signal digest');
    });
  });
});