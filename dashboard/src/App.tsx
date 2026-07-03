import { Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './components/error-boundary';
import { LayoutShell } from './components/layout-shell';
import { AuthGuard } from './components/auth-guard';
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
import { PricingPage } from './pages/pricing-page';
import { LoginPage } from './pages/login-page';
import { SignupPage } from './pages/signup-page';
import { DocsPage } from './pages/docs-page';
import { GuidePage } from './pages/guide-page';
import { AccountPage } from './pages/account-page';
import { CouponAdminPage } from './pages/coupon-admin-page';
import { SetupGuidePage } from './pages/setup-guide-page';
import { ReferralPage } from './pages/referral-page';
import { TermsPage } from './pages/terms-page';
import { PrivacyPage } from './pages/privacy-page';
import { LiveTradingPage } from './pages/live-trading-page';
import { StrategyDetailPage } from './pages/strategy-detail-page';
import { StrategyPerformancePage } from './pages/strategy-performance-page';
import { ApiKeysPage } from './pages/api-keys-page';
import { TrialStatusPage } from './pages/trial-status-page';

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
      <Routes>
        {/* Public routes - full page, no sidebar */}
        <Route path="/" element={<LandingSoloQuant />} />
        <Route path="/manifesto" element={<ManifestoPage />} />
        <Route path="/methodology" element={<MethodologyPage />} />
        <Route path="/cashclaw" element={<LandingPage />} />
        <Route path="/pricing" element={<PricingPage />} />
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
        <Route path="/app/referral" element={<AuthGuard><LayoutShell><ReferralPage /></LayoutShell></AuthGuard>} />
        <Route path="/app/live-trading" element={<AuthGuard><LayoutShell><LiveTradingPage /></LayoutShell></AuthGuard>} />
        <Route path="/app/strategy-performance" element={<AuthGuard><LayoutShell><StrategyPerformancePage /></LayoutShell></AuthGuard>} />
        <Route path="/app/strategies/:id" element={<AuthGuard><LayoutShell><StrategyDetailPage /></LayoutShell></AuthGuard>} />
        <Route path="/app/api-keys" element={<AuthGuard><LayoutShell><ApiKeysPage /></LayoutShell></AuthGuard>} />
        <Route path="/app/trial" element={<AuthGuard><LayoutShell><TrialStatusPage /></LayoutShell></AuthGuard>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <CoPilotChat />
    </ErrorBoundary>
  );
}
