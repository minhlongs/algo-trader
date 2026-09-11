/**
 * Vetting Types
 * Core interfaces for the strategy vetting subsystem.
 */

export interface VettingResult {
  approved: boolean;
  score: number;
  feedback: string;
  checks: VettingCheck[];
}

export interface VettingCheck {
  name: string;
  passed: boolean;
  detail: string;
}
