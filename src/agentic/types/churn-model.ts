/** Churn prediction model types */

export interface ChurnSignal {
  reason: 'inactive_7d' | 'trial_ending_soon' | 'usage_drop_50pct' | 'no_upgrade_day7';
  severity: 'low' | 'medium' | 'high';
  detail: string;
}

export interface ChurnScore {
  userId: string;
  score: number; // 0-1 probability
  signals: ChurnSignal[];
  calculatedAt: Date;
}
