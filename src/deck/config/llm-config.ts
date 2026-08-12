/**
 * @deprecated Legacy deck LLM config — functions as compatibility shim.
 * All routing now goes through OmniRoute at http://omnimbp.local:20128/v1.
 * Kept for import compatibility with modules that load this directly.
 */

import { loadLlmConfig } from '../shared/config/llm-config';

export const loadConfig = loadLlmConfig;
export { loadLlmConfig };
