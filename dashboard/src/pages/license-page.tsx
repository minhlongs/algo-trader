/**
 * License Management page: license list, audit logs, and analytics tabs.
 * Provides UI for managing RaaS licenses, viewing usage analytics, and audit trails.
 * Stitch redesign: dark fintech, bilingual VN+EN.
 */
import { useState } from 'react';
import { StitchCard, StitchCardBody, StitchPageShell, StitchTabs, StitchSectionTitle, StitchButton } from '../components/ui/stitch-components';
import { useLicenses, ActivateLicenseResult } from '../hooks/use-licenses';
import { LicenseListTable } from '../components/license-list-table';
import { CreateLicenseModal } from '../components/create-license-modal';
import { ActivateLicenseModal } from '../components/activate-license-modal';
import { AuditLogViewer } from '../components/audit-log-viewer';
import { UsageAnalyticsDashboard } from '../components/usage-analytics-dashboard';
import { COLORS } from '../lib/stitch-design-tokens';

const COPY = {
en: {
langToggle: 'Tiếng Việt',
title: 'License Management',
eyebrow: 'RAAS LICENSES',
tabLicenses: 'Licenses',
tabAudit: 'Audit Logs',
tabAnalytics: 'Analytics',
btnActivate: 'Activate License',
btnCreate: 'Create License',
btnViewAll: 'View all licenses',
sectionLicenseKeys: 'License Keys',
sectionAuditLogs: 'Audit Logs',
},
vi: {
langToggle: 'English',
title: 'Quản Lý License',
eyebrow: 'LICENSE RAAS',
tabLicenses: 'Licenses',
tabAudit: 'Nhật Ký',
tabAnalytics: 'Phân Tích',
btnActivate: 'Kích Hoạt',
btnCreate: 'Tạo License',
btnViewAll: 'Xem tất cả',
sectionLicenseKeys: 'Mã License',
sectionAuditLogs: 'Nhật Ký Audit',
},
};

type Lang = 'en' | 'vi';
type TabType = 'licenses' | 'audit-logs' | 'analytics';

const TABS = [
{ id: 'licenses', labelKey: 'tabLicenses' as const },
{ id: 'audit-logs', labelKey: 'tabAudit' as const },
{ id: 'analytics', labelKey: 'tabAnalytics' as const },
];

export function LicensePage() {
const [lang, setLang] = useState<Lang>('en');
const t = COPY[lang];
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

async function handleRevoke(licenseId: string) { await revokeLicense(licenseId); reload(); }
async function handleDelete(licenseId: string) { await deleteLicense(licenseId); reload(); }

function handleViewAudit(licenseId: string) {
setSelectedLicenseId(licenseId);
setActiveTab('audit-logs');
}

function renderLicensesTab() {
return (
<StitchCardBody>
<div className="flex items-center justify-between mb-4">
<h3 className="text-sm font-semibold" style={{ color: COLORS.onSurface }}>{t.sectionLicenseKeys}</h3>
<div className="flex gap-2">
<StitchButton onClick={handleActivateLicense} variant="secondary">{t.btnActivate}</StitchButton>
<StitchButton onClick={handleCreateLicense} variant="primary">{t.btnCreate}</StitchButton>
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
<h3 className="text-sm font-semibold" style={{ color: COLORS.onSurface }}>{t.sectionAuditLogs}</h3>
{selectedLicenseId && (
<button onClick={() => setSelectedLicenseId(null)} className="text-xs underline" style={{ color: COLORS.primary }}>
{t.btnViewAll}
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
{/* Lang toggle */}
<div className="flex justify-end">
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

<StitchSectionTitle title={t.title} eyebrow={t.eyebrow} />

<StitchTabs
active={activeTab}
tabs={TABS.map((tab) => t[tab.labelKey])}
onChange={(label) => {
const found = TABS.find((tab) => t[tab.labelKey] === label);
if (found) setActiveTab(found.id as TabType);
}}
/>

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
