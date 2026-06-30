/**
 * Inline form for creating a new coupon code.
 * Shown/hidden by parent via `visible` prop.
 */
import { useState } from 'react';
import type { CreateCouponPayload } from '../hooks/use-coupons';

const TIERS = ['STARTER', 'PRO', 'ELITE'] as const;

interface CouponCreateFormProps {
  visible: boolean;
  onSubmit: (payload: CreateCouponPayload) => Promise<boolean>;
  onCancel: () => void;
}

export function CouponCreateForm({ visible, onSubmit, onCancel }: CouponCreateFormProps) {
  const [code, setCode] = useState('');
  const [discountPercent, setDiscountPercent] = useState(10);
  const [maxUses, setMaxUses] = useState(0);
  const [validUntil, setValidUntil] = useState('');
  const [tiers, setTiers] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function toggleTier(tier: string) {
    setTiers((prev) => prev.includes(tier) ? prev.filter((t) => t !== tier) : [...prev, tier]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setSubmitting(true);
    const payload: CreateCouponPayload = {
      code: code.trim().toUpperCase(),
      discountPercent,
      maxUses: maxUses || undefined,
      validUntil: validUntil || undefined,
      applicableTiers: tiers.length > 0 ? tiers : undefined,
    };
    const ok = await onSubmit(payload);
    setSubmitting(false);
    if (ok) {
      setCode(''); setDiscountPercent(10); setMaxUses(0); setValidUntil(''); setTiers([]);
    }
  }

  if (!visible) return null;

  return (
    <form onSubmit={handleSubmit} className="bg-bg-surface border border-bg-border rounded-xl p-6 space-y-4">
      <h3 className="text-white text-sm font-semibold font-mono">New Coupon</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Code */}
        <div>
          <label className="block text-xs text-muted font-mono mb-1">Code</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="SAVE20"
            required
            className="w-full bg-bg border border-bg-border rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-accent"
          />
        </div>

        {/* Discount % */}
        <div>
          <label className="block text-xs text-muted font-mono mb-1">Discount % ({discountPercent})</label>
          <input
            type="range" min={1} max={100} value={discountPercent}
            onChange={(e) => setDiscountPercent(Number(e.target.value))}
            className="w-full accent-accent"
          />
        </div>

        {/* Max uses */}
        <div>
          <label className="block text-xs text-muted font-mono mb-1">Max Uses (0 = unlimited)</label>
          <input
            type="number" min={0} value={maxUses}
            onChange={(e) => setMaxUses(Number(e.target.value))}
            className="w-full bg-bg border border-bg-border rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-accent"
          />
        </div>

        {/* Valid until */}
        <div>
          <label className="block text-xs text-muted font-mono mb-1">Valid Until (optional)</label>
          <input
            type="date" value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className="w-full bg-bg border border-bg-border rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Tiers */}
      <div>
        <label className="block text-xs text-muted font-mono mb-2">Applicable Tiers (empty = all)</label>
        <div className="flex gap-3">
          {TIERS.map((t) => (
            <label key={t} className="flex items-center gap-1.5 text-sm font-mono text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={tiers.includes(t)}
                onChange={() => toggleTier(t)}
                className="accent-accent"
              />
              {t}
            </label>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting || !code.trim()}
          className="px-4 py-2 bg-accent text-bg-primary text-sm font-semibold font-mono rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Create Coupon'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-bg-border text-white text-sm font-mono rounded hover:bg-white/10 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
