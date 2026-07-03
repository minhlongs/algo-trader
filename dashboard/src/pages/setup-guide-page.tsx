/**
 * Detailed setup guide page at /app/setup — inside LayoutShell sidebar.
 * Step-by-step from VPN to live trading + dashboard connection.
 */
import { SetupGuideContent } from '../components/setup-guide-content';

export function SetupGuidePage() {
  return (
    <div className="max-w-[800px] mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-1 h-5 bg-accent rounded-full" />
          <h1 className="text-2xl font-bold text-white">Full Setup Guide</h1>
        </div>
        <p className="text-sm text-muted">
          Step-by-step: from zero to live trading with CashClaw.
        </p>
      </div>
      <SetupGuideContent />
    </div>
  );
}
