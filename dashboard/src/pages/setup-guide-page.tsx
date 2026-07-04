/**
 * Detailed setup guide page at /app/setup — inside LayoutShell sidebar.
 * Step-by-step from VPN to live trading + dashboard connection.
 */
import { SetupGuideContent } from '../components/setup-guide-content';

export function SetupGuidePage() {
  return (
    <div className="max-w-[800px] mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Full Setup Guide</h1>
        <p className="text-sm text-[#8892B0]">
          Step-by-step: from zero to live trading with CashClaw.
        </p>
      </div>
      <SetupGuideContent />
    </div>
  );
}
