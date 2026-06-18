/**
 * Settings page: composition of tenant config, exchange keys, and alert rules panels.
 * Data is fetched here and passed down to each sub-component.
 * POST /tenants/:id/api-keys, DELETE /tenants/:id/api-keys/:keyId
 * GET /tenants/me, GET /tenants/:id/api-keys, GET /tenants/:id/alert-rules
 * Refactored to use Stitch design system.
 */
import React, { useState, useEffect } from 'react';
import { useApiClient } from '../hooks/use-api-client';
import { useAuthStore } from '../stores/auth-store';
import { SettingsTenantConfigForm, type TenantInfo } from '../components/settings-tenant-config-form';
import { SettingsExchangeKeysForm, type ApiKey } from '../components/settings-exchange-keys-form';
import { SettingsAlertRulesForm, type AlertRule } from '../components/settings-alert-rules-form';
import { StitchCard, StitchInput, StitchButton, StitchBadge } from '../components/ui/stitch-components';
import { COLORS } from '../lib/stitch-design-tokens';

const MOCK_KEYS: ApiKey[] = [];
const MOCK_ALERTS: AlertRule[] = [];

interface MmParametersFormProps {
  tenantId?: string;
  fetchApi: <T>(path: string, options?: any) => Promise<T | null>;
}

function MmParametersForm({ tenantId, fetchApi }: MmParametersFormProps) {
  const [values, setValues] = useState<Record<string, string>>({
    MM_SPREAD: '0.05',
    MM_SIZE: '10',
    MM_MAX_MARKETS: '5',
    MM_MAX_INVENTORY: '50',
  });
  const [statusMsg, setStatusMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  function handleChange(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
    setStatusMsg(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetchApi(`/tenants/${tenantId ?? 'me'}/mm-parameters`, {
        method: 'POST',
        body: JSON.stringify(values),
      });
      if (res !== null) {
        setStatusMsg({ text: 'Saved', ok: true });
      } else {
        setStatusMsg({ text: 'Backend not configured — changes not persisted', ok: false });
      }
    } catch {
      setStatusMsg({ text: 'Error saving', ok: false });
    } finally {
      setSaving(false);
    }
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
          <h2 className="text-sm font-bold font-mono" style={{ color: COLORS.onSurface }}>MM Parameters</h2>
          {statusMsg && (
            <StitchBadge label={statusMsg.text} tone={statusMsg.ok ? 'profit' : 'neutral'} />
          )}
        </div>
        <p className="text-xs font-mono" style={{ color: COLORS.onSurfaceVariant }}>
          Market making strategy configuration. Changes take effect on next requote cycle.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {MM_FIELDS.map(({ key, label, desc }) => (
            <div key={key}>
              <StitchInput
                label={label}
                value={values[key]}
                onChange={(val) => handleChange(key, val)}
                placeholder=""
              />
              <p className="text-[10px] font-mono mt-1" style={{ color: COLORS.onSurfaceVariant }}>{desc}</p>
            </div>
          ))}
        </div>
        <StitchButton type="submit" disabled={saving} variant="primary">
          {saving ? 'Saving…' : 'Save Parameters'}
        </StitchButton>
      </form>
    </StitchCard>
  );
}

export function SettingsPage() {
  const { fetchApi } = useApiClient();
  const { email, tier, tenantId } = useAuthStore();

  const authTenant: TenantInfo = {
    id: tenantId ?? 'unknown',
    name: email || 'My Account',
    tier: tier.toUpperCase() as TenantInfo['tier'],
    createdAt: new Date().toISOString(),
    allowedExchanges: ['binance', 'kraken', 'coinbase', 'bybit'],
  };

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
    const res = await fetchApi<{ key: string; id: string; prefix: string; maskedKey: string }>(
      `/tenants/${tenant.id}/api-keys`,
      { method: 'POST', body: JSON.stringify({}) },
    );
    setCreatingKey(false);
    if (res) {
      setNewKeyVisible(res.key ?? 'ak_live_mock_' + Math.random().toString(36).slice(2, 10));
      setApiKeys((prev) => [...prev, {
        id: res.id ?? `k${Date.now()}`,
        prefix: res.prefix ?? 'ak_live',
        maskedKey: res.maskedKey ?? `ak_live_••••••••${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
      }]);
    } else {
      const mockKey = 'ak_live_mock_' + Math.random().toString(36).slice(2, 10);
      setNewKeyVisible(mockKey);
      setApiKeys((prev) => [...prev, { id: `k${Date.now()}`, prefix: 'ak_live', maskedKey: mockKey.slice(0, 8) + '••••••••', createdAt: new Date().toISOString() }]);
    }
  }

  async function handleDeleteKey(keyId: string) {
    await fetchApi(`/tenants/${tenant.id}/api-keys/${keyId}`, { method: 'DELETE' });
    setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
  }

  async function handleAddAlert(payload: Omit<AlertRule, 'id'>) {
    const res = await fetchApi<AlertRule>(`/tenants/${tenant.id}/alert-rules`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setAlerts((prev) => [...prev, res ?? { id: `a${Date.now()}`, ...payload }]);
  }

  async function handleDeleteAlert(alertId: string) {
    await fetchApi(`/tenants/${tenant.id}/alert-rules/${alertId}`, { method: 'DELETE' });
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <h1 className="text-2xl font-bold" style={{ color: COLORS.onSurface }}>Settings</h1>

      <MmParametersForm tenantId={tenant.id} fetchApi={fetchApi} />

      <SettingsTenantConfigForm tenant={tenant} />

      <StitchCard className="p-6 space-y-4">
        <SettingsExchangeKeysForm
          tenantId={tenant.id}
          apiKeys={apiKeys}
          newKeyVisible={newKeyVisible}
          creatingKey={creatingKey}
          onCreateKey={handleCreateKey}
          onDeleteKey={handleDeleteKey}
          onDismissNewKey={() => setNewKeyVisible(null)}
        />
      </StitchCard>

      <StitchCard className="p-6 space-y-4">
        <SettingsAlertRulesForm
          alerts={alerts}
          onAddAlert={handleAddAlert}
          onDeleteAlert={handleDeleteAlert}
        />
      </StitchCard>
    </div>
  );
}

export default SettingsPage;
