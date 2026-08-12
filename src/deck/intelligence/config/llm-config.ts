/**
 * @deprecated Legacy deck-intelligence LLM config — functions as compatibility shim.
 * All routing now goes through OmniRoute at http://omnimbp.local:20128/v1.
 * Kept for import compatibility with modules that load this directly.
 */

export { loadLlmConfig, type LlmConfig, type LlmEndpoint } from '../../shared/config/llm-config';
