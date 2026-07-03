/**
 * Response Formatter
 * Shared types and formatting for Co-pilot responses.
 */

export interface ActionButton {
  label: string;
  action: 'navigate' | 'execute' | 'toggle';
  payload?: unknown;
}

export interface CopilotResponse {
  answer: string;
  actions: ActionButton[];
  sourceData?: Record<string, unknown>;
}

/**
 * Format an answer string with an array of action buttons.
 */
export function formatResponse(answer: string, actions: ActionButton[], sourceData?: Record<string, unknown>): CopilotResponse {
  return {
    answer,
    actions,
    ...(sourceData ? { sourceData } : {}),
  };
}
