/**
 * License Management page: license list, audit logs, and analytics tabs.
 * Provides UI for managing RaaS licenses, viewing usage analytics, and audit trails.
 */
import { useState } from 'react';
import { useLicenses, ActivateLicenseResult } from '../hooks/use-licenses';
import { LicenseListTable } from '../components/license-list-table';
import { CreateLicenseModal } from '../components/create-license-modal';
import { ActivateLicenseModal } from '../components/activate-license-modal';
import { AuditLogViewer } from '../components/audit-log-viewer';
import { UsageAnalyticsDashboard } from '../components/usage-analytics-dashboard';
import { StitchPageShell } from '../components/ui/stitch-page-shell';
import { StitchCard, StitchCardBody } from '../components/ui/stitch-card';
import { StitchButton } from '../components/ui/stitch-button';
import { StitchTabs } from '../components/ui/stitch-tabs';
import { StitchSectionTitle } from '../components/ui/stitch-section-title';
import { COLORS } from '../lib/stitch-design-tokens';

type TabType = 'licenses' | 'audit-logs' | 'analytics';

const TABS = [
  { id: 'licenses', label: 'Licenses' },
  { id: 'audit-logs', label: 'Audit Logs' },
  { id: 'analytics', label: 'Analytics' },
] as const;

export function LicensePage() {
  const [activeTab, setActiveTab] = useState<TabType>('licenses');
  const { licenses, loading, error, revokeLicense, deleteLicense, reload } = useLicenses();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [activateModalOpen, setActivateModalOpen] = useState(false);
  const [selectedLicenseId, setSelectedLicenseId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function handleCreateLicense() { setCreateModalOpen(true); }
  function handleActivateLicense() { setActivateModalOpen(true); }

  function handleCreateSuccess(generatedKey: string) {
    setSuccessMessage(`License key generated: ${generatedKey.slice(0, 16)}...`);
    setCreateModalOpen(false);
    setTimeout(() => setSuccessMessage(null), 5000);
    reload();
  }

  function handleActivateSuccess(result: ActivateLicenseResult) {
    setSuccessMessage(`License activated: ${result.tier}${result.domain ? ` (${result.domain})` : ''}`);
    setActivateModalOpen(false);
    setTimeout(() => setSuccessMessage(null), 5000);
    reload();
  }

  async function handleRevoke(licenseId: string) {
    await revokeLicense(licenseId);
    reload();
  }

  async function handleDelete(licenseId: string) {
    await deleteLicense(licenseId);
    reload();
  }

  function handleViewAudit(licenseId: string) {
    setSelectedLicenseId(licenseId);
    setActiveTab('audit-logs');
  }

  function renderLicensesTab() {
    return (
      <StitchCardBody>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: COLORS.onSurface }}>License Keys</h3>
          <div className="flex gap-2">
            <StitchButton onClick={handleActivateLicense} variant="secondary">Activate License</StitchButton>
            <StitchButton onClick={handleCreateLicense} variant="primary">Create License</StitchButton>
          </div>
        </div>

        {successMessage && (
          <div className="mb-4 p-3 text-sm" style={{ backgroundColor: `${COLORS.profit}1a`, border: `1px solid ${COLORS.profit}4d`, color: COLORS.profit }}>
            {successMessage}
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 text-sm" style={{ backgroundColor: `${COLORS.loss}1a`, border: `1px solid ${COLORS.loss}4d`, color: COLORS.loss }}>
            Error: {error}
          </div>
        )}

        <LicenseListTable
          licenses={licenses}
          loading={loading}
          onRevoke={handleRevoke}
          onDelete={handleDelete}
          onViewAudit={handleViewAudit}
        />
      </StitchCardBody>
    );
  }

  function renderAuditLogsTab() {
    return (
      <StitchCardBody>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: COLORS.onSurface }}>Audit Logs</h3>
          {selectedLicenseId && (
            <button onClick={() => setSelectedLicenseId(null)} className="text-xs underline" style={{ color: COLORS.primary }}>
              View all licenses
            </button>
          )}
        </div>
        <AuditLogViewer licenseId={selectedLicenseId || undefined} />
      </StitchCardBody>
    );
  }

  function renderAnalyticsTab() {
    return <StitchCardBody><UsageAnalyticsDashboard /></StitchCardBody>;
  }

  return (
    <StitchPageShell>
      <div className="space-y-6 p-6">
        <StitchSectionTitle title="License Management" eyebrow="RAAS LICENSES" />

        <StitchTabs active={activeTab} tabs={TABS.map((t) => t.label)} onChange={(label) => setActiveTab(TABS.find((t) => t.label === label)!.id)} />

        <StitchCard>
          {activeTab === 'licenses' && renderLicensesTab()}
          {activeTab === 'audit-logs' && renderAuditLogsTab()}
          {activeTab === 'analytics' && renderAnalyticsTab()}
        </StitchCard>

        <CreateLicenseModal open={createModalOpen} onClose={() => setCreateModalOpen(false)} onSuccess={handleCreateSuccess} />
        <ActivateLicenseModal open={activateModalOpen} onClose={() => setActivateModalOpen(false)} onSuccess={handleActivateSuccess} />
      </div>
    </StitchPageShell>
  );
}

export default LicensePage;
