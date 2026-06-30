/**
 * Shared Config — barrel export
 * Centralized environment configuration.
 */

export { config, validateEnvVars, logConfigStatus } from './env';
export { loadLlmConfig, type LlmEndpoint, type LlmConfig } from './llm-config';
