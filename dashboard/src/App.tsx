import { Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './components/error-boundary';
import { LayoutShell } from './components/layout-shell';
import { AuthGuard } from './components/auth-guard';
import { ToastContainer } from './components/notifications/ToastContainer';
import { CoPilotChat } from './components/co-pilot/co-pilot-chat';
import { DashboardPage } from './pages/dashboard-page';
import { BacktestsPage } from './pages/backtests-page';
import { MarketplacePage } from './pages/marketplace-page';
import { SettingsPage } from './pages/settings-page';
import { ReportingPage } from './pages/reporting-page';
import { LicensePage } from './pages/license-page';
import { LandingPage } from './pages/landing-page';
import { LandingSoloQuant } from './pages/landing';
import { ManifestoPage } from './pages/manifesto';
import { MethodologyPage } from './pages/methodology';
import { EnterprisePage } from './pages/enterprise-page';
import { PricingPage } from './pages/pricing-page';
import { AlphaVangPage } from './pages/alpha-vang-page';
import { LoginPage } from './pages/login-page';
import { SignupPage } from './pages/signup-page';
import { DocsPage } from './pages/docs-page';
import { GuidePage } from './pages/guide-page';
import { AccountPage } from './pages/account-page';
import { CouponAdminPage } from './pages/coupon-admin-page';
import { NegRiskDashboardPage } from './pages/neg-risk-dashboard-page';
import { SetupGuidePage } from './pages/setup-guide-page';
import { TermsPage } from './pages/terms-page';
import { PrivacyPage } from './pages/privacy-page';
import { RiskSettingsPage } from './pages/risk-settings-page';
import { ApiKeysPage } from './pages/api-keys-page';
import { TrialStatusPage } from './pages/trial-status-page';
import { SubscriberOverviewPage } from './pages/subscriber-overview';
import { SubscriberEquityPage } from './pages/subscriber-equity';
import { SubscriberTradeHistoryPage } from './pages/subscriber-trade-history';

/**
 * Handle uncaught errors in the app.
 * Logs to console and can be extended to send to Sentry/etc.
 */
function handleGlobalError(error: Error): void {
  console.error('[App] Uncaught error:', error);
  // Future: Send to Sentry or other error tracking service
}

export function App() {
  return (
    <ErrorBoundary onError={handleGlobalError}>
      <>
        <ToastContainer />
        <CoPilotChat />
      </>
      <Routes>
        {/* Public routes - full page, no sidebar */}
        <Route path="/" element={<LandingSoloQuant />} />
        <Route path="/manifesto" element={<ManifestoPage />} />
        <Route path="/methodology" element={<MethodologyPage />} />
        <Route path="/cashclaw" element={<LandingPage />} />
      <Route path="/alpha-vang" element={<AlphaVangPage />} />
        <Route path="/pricing" element={<PricingPage />} />
<Route path="/enterprise" element={<EnterprisePage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        {/* App routes - sidebar layout, auth required */}
        <Route path="/app" element={<AuthGuard><LayoutShell><DashboardPage /></LayoutShell></AuthGuard>} />
        <Route path="/app/strategies" element={<AuthGuard><LayoutShell><MarketplacePage /></LayoutShell></AuthGuard>} />
        <Route path="/app/backtests" element={<AuthGuard><LayoutShell><BacktestsPage /></LayoutShell></AuthGuard>} />
        <Route path="/app/licenses" element={<AuthGuard><LayoutShell><LicensePage /></LayoutShell></AuthGuard>} />
        <Route path="/app/reporting" element={<AuthGuard><LayoutShell><ReportingPage /></LayoutShell></AuthGuard>} />
        <Route path="/app/settings" element={<AuthGuard><LayoutShell><SettingsPage /></LayoutShell></AuthGuard>} />
        <Route path="/app/guide" element={<AuthGuard><LayoutShell><GuidePage /></LayoutShell></AuthGuard>} />
        <Route path="/app/account" element={<AuthGuard><LayoutShell><AccountPage /></LayoutShell></AuthGuard>} />
        <Route path="/app/coupons" element={<AuthGuard><LayoutShell><CouponAdminPage /></LayoutShell></AuthGuard>} />
        <Route path="/app/setup" element={<AuthGuard><LayoutShell><SetupGuidePage /></LayoutShell></AuthGuard>} />
        <Route path="/app/risk-settings" element={<AuthGuard><LayoutShell><RiskSettingsPage /></LayoutShell></AuthGuard>} />
        <Route path="/app/terms" element={<AuthGuard><LayoutShell><TermsPage /></LayoutShell></AuthGuard>} />
        <Route path="/app/privacy" element={<AuthGuard><LayoutShell><PrivacyPage /></LayoutShell></AuthGuard>} />
        <Route path="/app/neg-risk" element={<AuthGuard><NegRiskDashboardPage /></AuthGuard>} />
 <Route path="/app/api-keys" element={<AuthGuard><LayoutShell><ApiKeysPage /></LayoutShell></AuthGuard>} />
 <Route path="/app/trial-status" element={<AuthGuard><LayoutShell><TrialStatusPage /></LayoutShell></AuthGuard>} />
 <Route path="/app/subscriber/overview" element={<AuthGuard><LayoutShell><SubscriberOverviewPage /></LayoutShell></AuthGuard>} />
 <Route path="/app/subscriber/equity" element={<AuthGuard><LayoutShell><SubscriberEquityPage /></LayoutShell></AuthGuard>} />
 <Route path="/app/subscriber/trades" element={<AuthGuard><LayoutShell><SubscriberTradeHistoryPage /></LayoutShell></AuthGuard>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
