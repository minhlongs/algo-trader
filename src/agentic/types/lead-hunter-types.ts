export interface ChurnSignal {
  reason: 'inactive_7d' | 'trial_ending' | 'tier_downgrade' | 'usage_drop';
  severity: 'low' | 'medium' | 'high';
  detail: string;
}

export interface LeadHunterState {
  telegramUserId: number;
  licenseId?: string;
  churnSignals: ChurnSignal[];
  welcomeSent: boolean;
  lastCheckIn: string | null;
  escalationSent: boolean;
}
