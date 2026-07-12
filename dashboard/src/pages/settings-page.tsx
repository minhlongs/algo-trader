/**
 * Settings page: composition of tenant config, exchange keys, and alert rules panels.
 * Data is fetched here and passed down to each sub-component.
 * POST /tenants/:id/api-keys, DELETE /tenants/:id/api-keys/:keyId
 * GET /tenants/me, GET /tenants/:id/api-keys, GET /tenants/:id/alert-rules
 * Stitch redesign: dark fintech, bilingual VN+EN.
 */
import { useState, useEffect } from 'react';
import { useApiClient } from '../hooks/use-api-client';
import { useAuthStore } from '../stores/auth-store';
import { SettingsTenantConfigForm, type TenantInfo } from '../components/settings-tenant-config-form';
import { SettingsExchangeKeysForm, type ApiKey } from '../components/settings-exchange-keys-form';
import { SettingsAlertRulesForm, type AlertRule } from '../components/settings-alert-rules-form';
import { StitchCard, StitchInput, StitchButton, StitchBadge } from '../components/ui/stitch-components';
import { COLORS } from '../lib/stitch-design-tokens';

const COPY = {
en: {
langToggle: 'Tiếng Việt',
title: 'Settings',
mmHeading: 'MM Parameters',
mmDesc: 'Market making strategy configuration. Changes take effect on next requote cycle.',
btnSave: 'Save Parameters',
btnSaving: 'Saving…',
saved: 'Saved',
errBackend: 'Backend not configured — changes not persisted',
errSave: 'Error saving',
},
vi: {
langToggle: 'English',
title: 'Cài Đặt',
mmHeading: 'Tham Số MM',
mmDesc: 'Cấu hình chiến lược market making. Thay đổi có hiệu lực ở chu kỳ requote tiếp theo.',
btnSave: 'Lưu Tham Số',
btnSaving: 'Đang lưu…',
saved: 'Đã lưu',
errBackend: 'Backend chưa cấu hình — thay đổi không được lưu',
errSave: 'Lỗi khi lưu',
},
};

type Lang = 'en' | 'vi';

const MOCK_KEYS: ApiKey[] = [];
const MOCK_ALERTS: AlertRule[] = [];

interface MmParametersFormProps {
tenantId?: string;
fetchApi: <T>(path: string, options?: RequestInit) => Promise<T | null>;
lang: Lang;
}

function MmParametersForm({ tenantId, fetchApi, lang }: MmParametersFormProps) {
const [values, setValues] = useState<Record<string, string>>({ MM_SPREAD: '0.05', MM_SIZE: '10', MM_MAX_MARKETS: '5', MM_MAX_INVENTORY: '50' });
const [statusMsg, setStatusMsg] = useState<{ text: string; ok: boolean } | null>(null);
const [saving, setSaving] = useState(false);
const t = COPY[lang];

function handleChange(key: string, val: string) { setValues((prev) => ({ ...prev, [key]: val })); setStatusMsg(null); }

async function handleSave(e: React.FormEvent) {
e.preventDefault();
setSaving(true); setStatusMsg(null);
try {
const res = await fetchApi(`/tenants/${tenantId ?? 'me'}/mm-parameters`, { method: 'POST', body: JSON.stringify(values) });
if (res !== null) setStatusMsg({ text: t.saved, ok: true });
else setStatusMsg({ text: t.errBackend, ok: false });
} catch { setStatusMsg({ text: t.errSave, ok: false }); }
finally { setSaving(false); }
}

const MM_FIELDS = [
{ key: 'MM_SPREAD', label: 'MM_SPREAD', desc: 'Half-spread quoted on each side (e.g. 0.05 = 5%)' },
{ key: 'MM_SIZE', label: 'MM_SIZE', desc: 'Position size per order in USDC' },
{ key: 'MM_MAX_MARKETS', label: 'MM_MAX_MARKETS', desc: 'Maximum number of markets to quote simultaneously' },
{ key: 'MM_MAX_INVENTORY', label: 'MM_MAX_INVENTORY', desc: 'Max net inventory exposure per market in USDC' },
];

return (
<StitchCard className="p-6 space-y-4">
<form onSubmit={handleSave}>
<div className="flex items-center justify-between">
<h2 className="text-sm font-bold font-mono" style={{ color: COLORS.onSurface }}>{t.mmHeading}</h2>
{statusMsg && <StitchBadge label={statusMsg.text} tone={statusMsg.ok ? 'profit' : 'neutral'} />}
</div>
<p className="text-xs font-mono" style={{ color: COLORS.onSurfaceVariant }}>{t.mmDesc}</p>
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
{MM_FIELDS.map(({ key, label, desc }) => (
<div key={key}>
<StitchInput label={label} value={values[key]} onChange={(val) => handleChange(key, val)} placeholder="" />
<p className="text-[10px] font-mono mt-1" style={{ color: COLORS.onSurfaceVariant }}>{desc}</p>
</div>
))}
</div>
<StitchButton type="submit" disabled={saving} variant="primary">{saving ? t.btnSaving : t.btnSave}</StitchButton>
</form>
</StitchCard>
);
}

export function SettingsPage() {
const [lang, setLang] = useState<Lang>('en');
const t = COPY[lang];
const { fetchApi } = useApiClient();
const { email, tier, tenantId } = useAuthStore();

const authTenant: TenantInfo = { id: tenantId ?? 'unknown', name: email || 'My Account', tier: tier.toUpperCase() as TenantInfo['tier'], createdAt: new Date().toISOString(), allowedExchanges: ['binance', 'kraken', 'coinbase', 'bybit'] };

const [tenant, setTenant] = useState<TenantInfo>(authTenant);
const [apiKeys, setApiKeys] = useState<ApiKey[]>(MOCK_KEYS);
const [alerts, setAlerts] = useState<AlertRule[]>(MOCK_ALERTS);
const [newKeyVisible, setNewKeyVisible] = useState<string | null>(null);
const [creatingKey, setCreatingKey] = useState(false);

useEffect(() => {
fetchApi<TenantInfo>('/tenants/me').then((d) => { if (d) setTenant(d); else setTenant(authTenant); });
fetchApi<ApiKey[]>(`/tenants/${tenant.id}/api-keys`).then((d) => { if (d) setApiKeys(d); });
fetchApi<AlertRule[]>(`/tenants/${tenant.id}/alert-rules`).then((d) => { if (d) setAlerts(d); });
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

async function handleCreateKey() {
setCreatingKey(true);
const res = await fetchApi<{ key: string; id: string; prefix: string; maskedKey: string }>(`/tenants/${tenant.id}/api-keys`, { method: 'POST', body: JSON.stringify({}) });
setCreatingKey(false);
if (res) {
setNewKeyVisible(res.key ?? 'ak_live_mock_' + Math.random().toString(36).slice(2, 10));
setApiKeys((prev) => [...prev, { id: res.id ?? `k${Date.now()}`, prefix: res.prefix ?? 'ak_live', maskedKey: res.maskedKey ?? `ak_live_••••••••${Math.random().toString(36).slice(2, 6)}`, createdAt: new Date().toISOString() }]);
} else {
const mockKey = 'ak_live_mock_' + Math.random().toString(36).slice(2, 10);
setNewKeyVisible(mockKey);
setApiKeys((prev) => [...prev, { id: `k${Date.now()}`, prefix: 'ak_live', maskedKey: mockKey.slice(0, 8) + '••••••••', createdAt: new Date().toISOString() }]);
}
}

async function handleDeleteKey(keyId: string) { await fetchApi(`/tenants/${tenant.id}/api-keys/${keyId}`, { method: 'DELETE' }); setApiKeys((prev) => prev.filter((k) => k.id !== keyId)); }
async function handleAddAlert(payload: Omit<AlertRule, 'id'>) { const res = await fetchApi<AlertRule>(`/tenants/${tenant.id}/alert-rules`, { method: 'POST', body: JSON.stringify(payload) }); setAlerts((prev) => [...prev, res ?? { id: `a${Date.now()}`, ...payload }]); }
async function handleDeleteAlert(alertId: string) { await fetchApi(`/tenants/${tenant.id}/alert-rules/${alertId}`, { method: 'DELETE' }); setAlerts((prev) => prev.filter((a) => a.id !== alertId)); }

return (
<div className="min-h-screen bg-[${COLORS.bg}] text-[${COLORS.onSurface}] font-sans">
{/* Lang toggle */}
<div className="flex justify-end px-4 sm:px-8 pt-6">
<button
onClick={() => setLang((l: Lang) => (l === 'en' ? 'vi' : 'en'))}
className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[${COLORS.outline}] bg-[${COLORS.surface}]/80 text-[${COLORS.onSurfaceVariant}] text-xs hover:border-[${COLORS.primary}] hover:text-[${COLORS.primary}] transition-colors"
aria-label="Toggle language"
>
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
<circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10" />
</svg>
{t.langToggle}
</button>
</div>

<div className="max-w-3xl mx-auto px-4 sm:px-8 py-8 space-y-8">
<h1 className="text-2xl font-bold" style={{ color: COLORS.onSurface }}>{t.title}</h1>
<MmParametersForm tenantId={tenant.id} fetchApi={fetchApi} lang={lang} />
<SettingsTenantConfigForm tenant={tenant} />
<StitchCard className="p-6 space-y-4">
<SettingsExchangeKeysForm tenantId={tenant.id} apiKeys={apiKeys} newKeyVisible={newKeyVisible} creatingKey={creatingKey} onCreateKey={handleCreateKey} onDeleteKey={handleDeleteKey} onDismissNewKey={() => setNewKeyVisible(null)} />
</StitchCard>
<StitchCard className="p-6 space-y-4">
<SettingsAlertRulesForm alerts={alerts} onAddAlert={handleAddAlert} onDeleteAlert={handleDeleteAlert} />
</StitchCard>
</div>
</div>
);
}

export default SettingsPage;
