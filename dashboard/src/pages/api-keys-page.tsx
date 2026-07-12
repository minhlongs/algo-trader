/**
 * API Keys Management Page
 *
 * List existing keys (GET /api/v1/api-keys)
 * Create dialog — shows full key once after creation (POST /api/v1/api-keys)
 * Revoke with confirmation dialog (DELETE /api/v1/api-keys/:id)
 *
 * Stitch redesign: dark fintech, bilingual VN+EN.
 */
import { useState, useEffect } from 'react';
import { useApiClient } from '../hooks/use-api-client';
import { StitchButton } from '../components/ui/stitch-components';
import { COLORS } from '../lib/stitch-design-tokens';

const COPY = {
en: {
langToggle: 'Tiếng Việt',
title: 'API Keys',
subtitle: 'Manage API keys for CLI and programmatic access to your account.',
btnNewKey: '+ New Key',
btnCreating: 'Creating...',
btnCreate: '+ Create API Key',
emptyTitle: 'No API keys yet',
emptyDesc: 'Create a key for CLI or programmatic access to your account.',
freshTitle: 'Key created successfully!',
freshDesc: 'Copy this key now — it will not be shown again.',
btnCopy: 'Copy to clipboard',
btnDismiss: '×',
labelRevoke: 'Revoke',
dialogTitle: 'Revoke API Key',
dialogMsg: 'Are you sure you want to revoke this key? This action cannot be undone.',
btnRevoking: 'Revoking...',
btnConfirmRevoke: 'Revoke',
btnCancel: 'Cancel',
loadingKeys: 'Loading API keys...',
errorLoad: 'Failed to load API keys. Ensure you are authenticated.',
errorCreate: 'Failed to create API key. Please try again.',
errorRevoke: 'Failed to revoke API key.',
createdOn: 'Created',
},
vi: {
langToggle: 'English',
title: 'API Keys',
subtitle: 'Quản lý API keys cho CLI và truy cập programmatic vào tài khoản.',
btnNewKey: '+ Key Mới',
btnCreating: 'Đang tạo...',
btnCreate: '+ Tạo API Key',
emptyTitle: 'Chưa có API key',
emptyDesc: 'Tạo key để truy cập CLI hoặc programmatic vào tài khoản.',
freshTitle: 'Key đã được tạo!',
freshDesc: 'Sao chép key này ngay — sẽ không hiển thị lại sau này.',
btnCopy: 'Sao chép',
btnDismiss: '×',
labelRevoke: 'Thu Hồi',
dialogTitle: 'Thu Hồi API Key',
dialogMsg: 'Bạn có chắc muốn thu hồi key này? Hành động không thể hoàn tác.',
btnRevoking: 'Đang thu hồi...',
btnConfirmRevoke: 'Thu Hồi',
btnCancel: 'Hủy',
loadingKeys: 'Đang tải API keys...',
errorLoad: 'Không thể tải API keys. Vui lòng đảm bảo bạn đã đăng nhập.',
errorCreate: 'Không thể tạo API key. Vui lòng thử lại.',
errorRevoke: 'Không thể thu hồi API key.',
createdOn: 'Tạo lúc',
},
};

type Lang = 'en' | 'vi';

interface ApiKeyRecord {
id: string;
prefix: string;
maskedKey: string;
createdAt: string;
}

function formatDate(iso: string): string {
try {
return new Date(iso).toLocaleDateString('en-US', {
year: 'numeric', month: 'short', day: 'numeric',
});
} catch { return iso; }
}

export function ApiKeysPage() {
const [lang, setLang] = useState<Lang>('en');
const t = COPY[lang];
const { fetchApi } = useApiClient();

const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
const [pageLoading, setPageLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

const [creating, setCreating] = useState(false);
const [freshKey, setFreshKey] = useState<string | null>(null);
const [revokeTarget, setRevokeTarget] = useState<ApiKeyRecord | null>(null);
const [revoking, setRevoking] = useState(false);

/* Load keys on mount */
useEffect(() => {
let cancelled = false;
setPageLoading(true);
setError(null);
fetchApi<ApiKeyRecord[]>('/v1/api-keys').then((data) => {
if (cancelled) return;
if (data) { setKeys(data); }
else { setError(t.errorLoad); }
setPageLoading(false);
});
return () => { cancelled = true; };
}, [fetchApi, t.errorLoad]);

/* Create */
async function handleCreate() {
setCreating(true);
setFreshKey(null);
setError(null);
try {
const result = await fetchApi<ApiKeyRecord & { key: string }>('/v1/api-keys', {
method: 'POST',
body: JSON.stringify({}),
});
if (result && 'key' in result) {
setFreshKey(result.key);
setKeys((prev) => [{
id: result.id, prefix: result.prefix, maskedKey: result.maskedKey,
createdAt: new Date().toISOString(),
}, ...prev]);
} else { setError(t.errorCreate); }
} catch { setError(t.errorCreate); }
finally { setCreating(false); }
}

/* Revoke */
async function handleRevokeConfirm() {
if (!revokeTarget) return;
setRevoking(true);
setError(null);
try {
await fetchApi(`/v1/api-keys/${revokeTarget.id}`, { method: 'DELETE' });
setKeys((prev) => prev.filter((k) => k.id !== revokeTarget.id));
} catch { setError(t.errorRevoke); }
finally { setRevoking(false); setRevokeTarget(null); }
}

function dismissFreshKey() { setFreshKey(null); }

/* ── Loading ── */
if (pageLoading) {
return (
<div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans flex items-center justify-center">
<div className="flex flex-col items-center gap-3">
<svg className="animate-spin h-8 w-8 text-[#0070f3]" fill="none" viewBox="0 0 24 24">
<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
</svg>
<p className="text-[#c1c6d7] text-xs">{t.loadingKeys}</p>
</div>
</div>
);
}

/* ── Main ── */
return (
<div className="min-h-screen bg-[#0a0a0a] text-[#e3e2e2] font-sans">
{/* Lang toggle */}
<div className="flex justify-end px-4 sm:px-8 pt-6">
<button
onClick={() => setLang((l: Lang) => (l === 'en' ? 'vi' : 'en'))}
className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#414754] bg-[#121414]/80 text-[#c1c6d7] text-xs hover:border-[#aec6ff] hover:text-[#aec6ff] transition-colors"
aria-label="Toggle language"
>
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
<circle cx="12" cy="12" r="10" />
<path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10" />
</svg>
{t.langToggle}
</button>
</div>

<div className="max-w-2xl mx-auto px-4 sm:px-8 py-8 space-y-6">
{/* Header */}
<div className="flex items-center justify-between">
<div>
<h1 className="text-white text-2xl font-bold">{t.title}</h1>
<p className="text-[#c1c6d7] text-xs mt-1">{t.subtitle}</p>
</div>
{keys.length > 0 && (
<StitchButton onClick={handleCreate} variant="primary" disabled={creating}>
{creating ? t.btnCreating : t.btnNewKey}
</StitchButton>
)}
</div>

{/* Error banner */}
{error && (
<div className="bg-[#ffb4ab]/10 border border-[#ffb4ab]/30 rounded-xl p-3 flex items-center justify-between">
<span className="text-[#ffb4ab] text-xs">{error}</span>
<button onClick={() => setError(null)} className="text-[#ffb4ab]/60 text-xs hover:text-[#ffb4ab] ml-3">×</button>
</div>
)}

{/* Fresh key banner */}
{freshKey && (
<div className="bg-[#3b82f6]/10 border border-[#3b82f6]/30 rounded-xl p-4 space-y-2">
<div className="flex items-start justify-between gap-3">
<div>
<p className="text-[#3b82f6] text-xs font-bold mb-1">{t.freshTitle}</p>
<p className="text-[#3b82f6]/80 text-[10px]">{t.freshDesc}</p>
</div>
<button onClick={dismissFreshKey} className="text-[#c1c6d7] hover:text-white text-xs flex-shrink-0">×</button>
</div>
<div className="bg-[#0a0a0a] border border-[#414754] rounded-xl px-3 py-2.5">
<code className="text-white text-xs break-all select-all">{freshKey}</code>
</div>
<button onClick={() => navigator.clipboard.writeText(freshKey)} className="text-[#aec6ff] text-[10px] hover:underline">
{t.btnCopy}
</button>
</div>
)}

{/* Key list or empty */}
{keys.length === 0 ? (
<div className="flex flex-col items-center justify-center py-16 text-center">
<svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke={COLORS.onSurfaceVariant} strokeWidth="1.5" className="mb-4">
<path d="M15.75 5.25a3 3 0 013 3m0 0v6m0-6a3 3 0 00-3-3m0 0H9.75m3 0a9 9 0 00-9 9v3h18v-3a9 9 0 00-9-9z" strokeLinecap="round" strokeLinejoin="round" />
</svg>
<p className="text-xs mb-1" style={{ color: COLORS.onSurfaceVariant }}>{t.emptyTitle}</p>
<p className="text-xs mb-6" style={{ color: COLORS.onSurfaceVariant }}>{t.emptyDesc}</p>
<StitchButton onClick={handleCreate} variant="primary">{t.btnCreate}</StitchButton>
</div>
) : (
<div className="space-y-2">
{keys.map((k) => (
<div key={k.id} className="bg-[#121414]/80 border border-[#414754] rounded-xl px-4 py-3 flex items-center justify-between gap-4 hover:border-[#0070f3]/30 transition-colors">
<div className="min-w-0 flex-1">
<div className="flex items-center gap-2 mb-0.5">
<code className="text-white text-xs truncate">{k.maskedKey}</code>
<span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: COLORS.outline, color: COLORS.onSurfaceVariant }}>{k.prefix}</span>
</div>
<p className="text-[10px]" style={{ color: COLORS.onSurfaceVariant }}>{t.createdOn} {formatDate(k.createdAt)}</p>
</div>
<button
onClick={() => setRevokeTarget(k)}
disabled={revoking}
className="text-xs px-2 py-1 rounded-lg hover:bg-[#ffb4ab]/10 transition-colors disabled:opacity-50 flex-shrink-0"
style={{ color: COLORS.loss }}
>
{t.labelRevoke}
</button>
</div>
))}
</div>
)}

{/* Revoke dialog */}
{revokeTarget && (
<div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setRevokeTarget(null)}>
<div className="bg-[#121414]/90 border border-[#414754] rounded-2xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
<h3 className="text-sm font-semibold text-white mb-2">{t.dialogTitle}</h3>
<p className="text-xs mb-4" style={{ color: COLORS.onSurfaceVariant }}>
{t.dialogMsg}{' '}
<code className="text-white">{revokeTarget.maskedKey}</code>
</p>
<div className="flex gap-2 justify-end">
<button onClick={() => setRevokeTarget(null)} className="px-3 py-1.5 text-xs rounded-lg border border-[#414754] text-[#c1c6d7] hover:border-[#aec6ff] transition-colors">
{t.btnCancel}
</button>
<button onClick={handleRevokeConfirm} disabled={revoking} className="px-3 py-1.5 text-xs rounded-lg font-semibold text-white disabled:opacity-50 transition-colors" style={{ backgroundColor: COLORS.loss }}>
{revoking ? t.btnRevoking : t.btnConfirmRevoke}
</button>
</div>
</div>
</div>
)}

{/* Creating overlay */}
{creating && (
<div className="flex items-center justify-center py-4">
<div className="flex items-center gap-2 text-xs" style={{ color: COLORS.onSurfaceVariant }}>
<svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
</svg>
Creating API key...
</div>
</div>
)}
</div>
</div>
);
}

export default ApiKeysPage;
