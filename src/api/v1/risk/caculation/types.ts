// ──────────────────────────────────────────────────────────────────────────────
// Domain types — RiskCalculation
// ──────────────────────────────────────────────────────────────────────────────

export type SortDirection = 'asc' | 'desc';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface RiskCalculationMetadata {
  algorithm: string;
  triggeredBy: string;
  executionId: string;
}

export interface RiskCalculationRequest {
  readonly limit: number; // [100, 1000]
  readonly sort?: SortDirection;
  readonly riskLevel?: RiskLevel;
  readonly includeHistory?: boolean;
  readonly metadata?: Partial<RiskCalculationMetadata>;
}

export interface RiskCalculationResult {
  id: string;
  riskScore: number; // 0-100
  level: RiskLevel;
  symbol: string;
  calculatedAt: string; // ISO-8601
  confidence: number; // 0-1
  factors: string[];
  triggeredBy: string;
  algorithm: string;
}

export interface RiskCalculationPaginatedResponse {
  items: RiskCalculationResult[];
  total: number;
  page: number;
  limit: number;
  riskLevel?: string;
  cached?: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// TokenGuard — single-authority JWT verifier (RightsGuard delegates here)
// ──────────────────────────────────────────────────────────────────────────────

export interface TokenPayload {
  ratId: string;
  wallet: string;
  scope: string[];
  exp: number;
}

export type IdentifyResult = {
  ratId: string;
  wallet: string;
} | null;

// ──────────────────────────────────────────────────────────────────────────────
// Error taxonomy (discriminated union — no class hierarchy)
// ──────────────────────────────────────────────────────────────────────────────

export type AppError =
  | { code: 'INVALID_REQUEST'; message: string; cause?: unknown }
  | { code: 'UNAUTHORIZED'; message: string; cause?: unknown }
  | { code: 'FORBIDDEN'; message: string; cause?: unknown }
  | { code: 'REPOSITORY_FAILURE'; message: string; cause?: unknown };

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { code?: string }).code === 'string'
  );
}

// Status mapping — single source of truth
const ERROR_STATUS: Record<string, number> = {
  INVALID_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  REPOSITORY_FAILURE: 502,
};

export function statusFor(error: AppError): number {
  return ERROR_STATUS[error.code] ?? 502;
}

// ──────────────────────────────────────────────────────────────────────────────
// Repository contract (interface-first, swap-implementation pattern)
// ──────────────────────────────────────────────────────────────────────────────

export interface RiskCalculationRepository {
  fromCache(params: Readonly<RiskCalculationRequest>): Promise<RiskCalculationResult[] | null>;
  saveCache(params: Readonly<RiskCalculationRequest>, data: readonly RiskCalculationResult[]): Promise<void>;
}
