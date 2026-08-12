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
    url: process.env.LLM_PRIMARY_URL ?? 'http://omnimbp.local:20128/v1',
    model: process.env.LLM_PRIMARY_MODEL ?? 'deepseek-v4-flash',
    apiKey: process.env.LLM_PRIMARY_API_KEY,
  };

  const config: LlmConfig = { primary };
  if (process.env.LLM_QWEN_URL || process.env.LLM_QWEN_API_KEY) {
    config.qwen = {
      url: process.env.LLM_QWEN_URL ?? 'http://omnimbp.local:20128/v1',
      model: process.env.LLM_QWEN_MODEL ?? 'deepseek-v4-flash',
      apiKey: process.env.LLM_QWEN_API_KEY,
    };
  }
  return config;
}
