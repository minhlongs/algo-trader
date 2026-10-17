import type { LeadSourceNetwork, SubscriberTier } from './lead-attribution-types';

export function resolveNetworkSource(source?: string): LeadSourceNetwork {
  if (!source) return 'DIRECT';
  const s = source.toUpperCase();
  if (s.includes('TIKTOK')) return 'TIKTOK';
  if (s.includes('SHOPEE')) return 'SHOPEE';
  if (s.includes('TELEGRAM') || s.includes('TG')) return 'TELEGRAM';
  if (s.includes('TWITTER') || s.includes('X.COM')) return 'TWITTER';
  if (s.includes('PARTNER') || s.includes('AFFILIATE')) return 'PARTNER';
  if (s.includes('GOOGLE') || s.includes('FACEBOOK') || s.includes('WEB')) return 'WEB';
  return 'DIRECT';
}

export function generateTierOnboardingSteps(tier: SubscriberTier): string[] {
  switch (tier) {
    case 'BASIC':
      return ['setup-api-keys', 'select-trading-pair', 'enable-paper-mode'];
    case 'PREMIUM':
      return ['setup-api-keys', 'configure-statarb', 'enable-telegram-alerts', 'run-backtest'];
    case 'ENTERPRISE':
    case 'MASTER':
      return ['dedicated-edge-routing', 'risk-cockpit-setup', 'multi-region-failover', 'vip-consultation'];
    case 'FREE':
    default:
      return ['verify-email'];
  }
}
