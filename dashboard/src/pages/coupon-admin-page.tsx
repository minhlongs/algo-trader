/**
 * Coupon Admin page — full CRUD for coupon codes.
 * Admin API key read from localStorage 'adminApiKey' or prompted inline.
 * Splits into: CouponCreateForm component + this page (table + controls).
 */
import { useState } from 'react';
import { useCoupons } from '../hooks/use-coupons';
import { CouponCreateForm } from '../components/coupon-create-form';
import type { Coupon } from '../hooks/use-coupons';

function formatExpiry(val: string | null) {
  if (!val) return <span className="text-muted">—</span>;
  return <span>{new Date(val).toLocaleDateString()}</span>;
}

function formatTiers(tiers: string[]) {
  if (!tiers || tiers.length === 0) return <span className="text-muted text-xs">All</span>;
  return <span className="text-xs">{tiers.join(', ')}</span>;
}

function CouponRow({ coupon, onDeactivate }: { coupon: Coupon; onDeactivate: (code: string) => void }) {
  return (
    <tr className="border-t border-bg-border hover:bg-white/[0.02] transition-colors">
      <td className="py-3 px-4 font-mono text-sm text-white font-semibold tracking-wider">{coupon.code}</td>
      <td className="py-3 px-4 font-mono text-sm text-accent">{coupon.discountPercent}%</td>
      <td className="py-3 px-4 font-mono text-sm text-muted">
        {coupon.currentUses}/{coupon.maxUses === 0 ? '∞' : coupon.maxUses}
      </td>
      <td className="py-3 px-4 font-mono text-sm">{formatTiers(coupon.applicableTiers)}</td>
      <td className="py-3 px-4 font-mono text-sm text-muted">{formatExpiry(coupon.validUntil)}</td>
      <td className="py-3 px-4">
        <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-full ${
          coupon.active ? 'text-profit bg-profit/10' : 'text-muted bg-white/5'
        }`}>
          {coupon.active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="py-3 px-4">
        {coupon.active && (
          <button
            onClick={() => onDeactivate(coupon.code)}
            className="text-xs font-mono text-loss hover:text-loss/80 transition-colors border border-loss/30 px-2 py-1 rounded hover:bg-loss/10"
          >
            Deactivate
          </button>
        )}
      </td>
    </tr>
  );
}

export function CouponAdminPage() {
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('adminApiKey') ?? '');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const { coupons, loading, error, createCoupon, deactivateCoupon } = useCoupons(apiKey);

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  function saveApiKey() {
    const key = apiKeyInput.trim();
    if (!key) return;
    localStorage.setItem('adminApiKey', key);
    setApiKey(key);
    setApiKeyInput('');
  }

  async function handleCreate(payload: Parameters<typeof createCoupon>[0]) {
    const ok = await createCoupon(payload);
    if (ok) { showToast(`Coupon "${payload.code}" created`, 'success'); setShowForm(false); }
    else showToast(error ?? 'Failed to create coupon', 'error');
    return ok;
  }

  async function handleDeactivate(code: string) {
    const ok = await deactivateCoupon(code);
    if (ok) showToast(`Coupon "${code}" deactivated`, 'success');
    else showToast(error ?? 'Failed to deactivate coupon', 'error');
  }

  return (
    <div className="space-y-6 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-white text-lg font-bold tracking-tight">Coupon Management</h2>
          <p className="text-muted text-xs mt-0.5">Create and manage discount coupon codes</p>
        </div>
        {apiKey && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="px-4 py-2 bg-accent text-bg-primary text-sm font-semibold rounded hover:bg-accent/90 transition-colors"
          >
            {showForm ? 'Cancel' : 'Create Coupon'}
          </button>
        )}
      </div>

      {/* API key prompt */}
      {!apiKey && (
        <div className="bg-bg-surface border border-bg-border rounded-xl p-6">
          <p className="text-muted text-sm mb-3">Enter your admin API key to manage coupons.</p>
          <div className="flex gap-3">
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveApiKey()}
              placeholder="Admin API key..."
              className="flex-1 bg-bg border border-bg-border rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-accent"
            />
            <button
              onClick={saveApiKey}
              className="px-4 py-2 bg-accent text-bg-primary text-sm font-semibold rounded hover:bg-accent/90 transition-colors"
            >
              Save Key
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`p-3 rounded border flex items-center justify-between text-sm ${
          toast.type === 'success'
            ? 'bg-profit/10 border-profit/40 text-profit'
            : 'bg-loss/10 border-loss/40 text-loss'
        }`}>
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} className="ml-4 opacity-70 hover:opacity-100">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Create form */}
      <CouponCreateForm visible={showForm} onSubmit={handleCreate} onCancel={() => setShowForm(false)} />

      {/* Coupon table */}
      {apiKey && (
        <div className="bg-bg-surface border border-bg-border rounded-xl overflow-hidden">
          {loading && (
            <p className="p-6 text-muted text-sm">Loading coupons...</p>
          )}
          {!loading && error && (
            <p className="p-6 text-loss text-sm">Error: {error}</p>
          )}
          {!loading && !error && coupons.length === 0 && (
            <p className="p-6 text-muted text-sm">No coupons found. Create your first one above.</p>
          )}
          {!loading && coupons.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-muted text-xs uppercase">
                    <th className="py-3 px-4 font-mono">Code</th>
                    <th className="py-3 px-4 font-mono">Discount</th>
                    <th className="py-3 px-4 font-mono">Uses</th>
                    <th className="py-3 px-4 font-mono">Tiers</th>
                    <th className="py-3 px-4 font-mono">Expires</th>
                    <th className="py-3 px-4 font-mono">Status</th>
                    <th className="py-3 px-4 font-mono">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.map((c) => (
                    <CouponRow key={c.code} coupon={c} onDeactivate={handleDeactivate} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CouponAdminPage;
