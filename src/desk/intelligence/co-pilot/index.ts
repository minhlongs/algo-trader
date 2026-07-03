/**
 * Co-pilot — AI assistant for trading operations
 * @module desk/intelligence/co-pilot
 */

export { classifyIntent } from './intent-classifier';
export type { Intent, ClassifiedIntent } from './intent-classifier';

export { formatResponse } from './response-formatter';
export type { CopilotResponse, ActionButton } from './response-formatter';

export { handleRiskQuery } from './handlers/risk-handler';
export { handleArbQuery } from './handlers/arb-handler';
export { handlePerformanceQuery } from './handlers/performance-handler';
export { handleRegimeQuery } from './handlers/regime-handler';
export { handleReportQuery } from './handlers/report-handler';
export { handleFallback } from './handlers/fallback-handler';
