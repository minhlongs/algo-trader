/** LLM configuration types and loader. */
export interface LlmProviderConfig {
  url: string;
  model: string;
  apiKey?: string;
}

export interface LlmConfig {
  primary: LlmProviderConfig;
  qwen?: LlmProviderConfig;
  fallback?: LlmProviderConfig;
}

export function loadLlmConfig(): LlmConfig {
  const primary: LlmProviderConfig = {
    url: process.env.LLM_PRIMARY_URL ?? process.env.OPENROUTER_API_URL ?? 'https://api.deepseek.com/v1',
    model: process.env.LLM_PRIMARY_MODEL ?? process.env.OPENROUTER_MODEL ?? 'deepseek-v4-flash-0731',
    apiKey: process.env.LLM_PRIMARY_API_KEY ?? process.env.OPENROUTER_API_KEY,
  };

  const config: LlmConfig = { primary };
  if (process.env.LLM_QWEN_URL || process.env.QWEN_API_URL) {
    config.qwen = {
      url: process.env.LLM_QWEN_URL ?? process.env.QWEN_API_URL ?? '',
      model: process.env.LLM_QWEN_MODEL ?? 'qwen-turbo',
      apiKey: process.env.LLM_QWEN_API_KEY ?? process.env.QWEN_API_KEY,
    };
  }
  if (process.env.LLM_FALLBACK_URL) {
    config.fallback = {
      url: process.env.LLM_FALLBACK_URL,
      model: process.env.LLM_FALLBACK_MODEL ?? primary.model,
      apiKey: process.env.LLM_FALLBACK_API_KEY,
    };
  }
  return config;
}
