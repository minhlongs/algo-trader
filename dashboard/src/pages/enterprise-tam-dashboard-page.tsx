/**
 * Enterprise TAM Dashboard Page
 * Internal page for Technical Account Managers to view and manage inquiries.
 * Reads from GET /api/enterprise/inquiries — protected route (auth required).
 * Status updates via PATCH /api/enterprise/inquiries/:id.
 */

import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { ENTERPRISE_PLANS, type EnterprisePlanKey } from '../lib/enterprise-plans';

interface EnterpriseInquiry {
  id: string;
  email: string;
  companyName: string;
  contactName: string;
  tier: EnterprisePlanKey;
  useCase: string;
  teamSize?: string;
  status: string;
  tamAssigned?: string;
  paperdemoProvisioned: boolean;
  paperdemoKey?: string;
  createdAt: string;
  notes?: string;
}

type LoadState = 'loading' | 'ready' | 'error';

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  tam_notified: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  contacted: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  demo_active: 'bg-[#00D4AA]/15 text-[#00D4AA] border-[#00D4AA]/30',
  negotiating: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  closed_won: 'bg-green-500/15 text-green-400 border-green-500/30',
  closed_lost: 'bg-red-500/15 text-red-400 border-red-500/30',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? 'bg-gray-500/15 text-gray-400 border-gray-500/30';
  return (
    <span className={`inline-block text-[10px] font-bold uppercase tracking-widest border px-2 py-0.5 rounded-full ${cls}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function InquiryRow({
  inquiry,
  onStatusChange,
}: {
  inquiry: EnterpriseInquiry;
  onStatusChange: (id: string, status: string) => void;
}) {
  const plan = ENTERPRISE_PLANS[inquiry.tier];
  return (
    <tr className="border-b border-[#1E2640] hover:bg-[#111627]/50">
      <td className="py-3 px-4">
        <p className="text-sm font-semibold text-white">{inquiry.companyName}</p>
        <p className="text-xs text-[#8892B0]">{inquiry.contactName}</p>
        <p className="text-xs text-[#555]">{inquiry.email}</p>
      </td>
      <td className="py-3 px-4 text-xs text-white">{plan?.price ?? inquiry.tier}</td>
      <td className="py-3 px-4"><StatusBadge status={inquiry.status} /></td>
      <td className="py-3 px-4 text-xs text-[#8892B0]">
        {inquiry.paperdemoProvisioned ? (
          <span className="text-[#00D4AA]">Active</span>
        ) : (
          <span className="text-[#555]">—</span>
        )}
      </td>
      <td className="py-3 px-4 text-xs text-[#8892B0]">
        {new Date(inquiry.createdAt).toLocaleDateString()}
      </td>
      <td className="py-3 px-4">
        <select
          value={inquiry.status}
          onChange={(e) => onStatusChange(inquiry.id, e.target.value)}
          className="text-xs bg-[#161A1E] border border-[#1E2640] text-[#8892B0] rounded px-2 py-1 outline-none focus:border-[#00C8E8]/50"
        >
          {['new','tam_notified','contacted','demo_active','negotiating','closed_won','closed_lost'].map((s) => (
            <option key={s} value={s}>{s.replace('_',' ')}</option>
          ))}
        </select>
      </td>
    </tr>
  );
}

export function EnterpriseTamDashboardPage() {
  const role = useAuthStore((state) => state.role);

  // Guard: only admin may access this internal page
  if (role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const [inquiries, setInquiries] = useState<EnterpriseInquiry[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/enterprise/inquiries');
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const data = (await res.json()) as EnterpriseInquiry[];
        setInquiries(data);
        setLoadState('ready');
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load inquiries');
        setLoadState('error');
      }
    })();
  }, []);

  async function handleStatusChange(id: string, status: string) {
    try {
      const res = await fetch(`/api/enterprise/inquiries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`Update failed (${res.status})`);
      setInquiries((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    } catch (err) {
      console.error('[TAM dashboard] status update failed', err);
    }
  }

  const stats = {
    total: inquiries.length,
    open: inquiries.filter((i) => !['closed_won', 'closed_lost'].includes(i.status)).length,
    won: inquiries.filter((i) => i.status === 'closed_won').length,
  };

  return (
    <div className="min-h-screen bg-[#080B14] text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <p className="text-[#00C8E8] text-xs uppercase tracking-widest mb-2">Internal</p>
          <h1 className="text-2xl font-bold">Enterprise TAM Dashboard</h1>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Total inquiries', value: stats.total },
            { label: 'Open', value: stats.open },
            { label: 'Closed won', value: stats.won },
          ].map(({ label, value }) => (
            <div key={label} className="border border-[#1E2640] bg-[#111627] rounded-lg p-4">
              <p className="text-xs text-[#8892B0] mb-1">{label}</p>
              <p className="text-2xl font-bold text-white">{value}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        {loadState === 'loading' && (
          <p className="text-[#8892B0] text-sm text-center py-12">Loading inquiries…</p>
        )}
        {loadState === 'error' && (
          <p className="text-red-400 text-sm text-center py-12">{errorMsg}</p>
        )}
        {loadState === 'ready' && (
          <div className="border border-[#1E2640] rounded-lg overflow-hidden">
            {inquiries.length === 0 ? (
              <p className="text-[#8892B0] text-sm text-center py-12">No enterprise inquiries yet.</p>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#1E2640] bg-[#161A1E]">
                    {['Company / Contact', 'Tier', 'Status', 'Demo', 'Submitted', 'Update status'].map((h) => (
                      <th key={h} className="py-2.5 px-4 text-xs text-[#8892B0] font-semibold uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inquiries.map((inq) => (
                    <InquiryRow key={inq.id} inquiry={inq} onStatusChange={(id, s) => { void handleStatusChange(id, s); }} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
