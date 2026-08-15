import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateLlmBlogPost } from '../llm-content-generator';
import { generateSignalDigest } from '../auto-marketing-daemon';

vi.mock('../../lib/llm-router', () => {
  const fakeResponse = {
    content: 'Mocked LLM content for test.',
    provider: 'mock',
    model: 'mock-model',
    finishReason: 'stop',
    usage: {
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    },
    latencyMs: 1,
  };

  const mockFastChat = vi.fn().mockResolvedValue(fakeResponse);
  const MockLlmRouter = vi.fn().mockImplementation(() => ({
    fastChat: mockFastChat,
  }));

  return {
    LlmRouter: MockLlmRouter,
    ChatMessage: class ChatMessage {},
  };
});

describe('LLM Content Generator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should generate blog post from signal digest', async () => {
    vi.advanceTimersByTime(31_000);
    const post = await generateLlmBlogPost('signal-digest', generateSignalDigest);
    expect(post.id).toBeTruthy();
    expect(post.title).toBeTruthy();
    expect(post.type).toBe('signal-digest');
    expect(post.content.length).toBeGreaterThan(50);
  }, 30_000);

  it('should fallback to template when LLM unavailable', async () => {
    vi.advanceTimersByTime(31_000);
    const post = await generateLlmBlogPost('signal-digest', generateSignalDigest);
    expect(post.id).toBeTruthy();
    expect(post.title).toBeTruthy();
    expect(post.type).toBe('signal-digest');
    expect(post.content.length).toBeGreaterThan(50);
  }, 30_000);

  it('should preserve post type from fallback generator', async () => {
    vi.advanceTimersByTime(31_000);
    const post = await generateLlmBlogPost('market-analysis', generateSignalDigest);
    expect(post.id).toBeTruthy();
    expect(post.content.length).toBeGreaterThan(50);
  }, 30_000);
});
