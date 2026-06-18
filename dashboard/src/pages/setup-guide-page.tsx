/**
 * Detailed setup guide page at /app/setup — inside LayoutShell sidebar.
 * Step-by-step from VPN to live trading + dashboard connection.
 * Stitch-aligned UI using shared components.
 */
import { SetupGuideContent } from '../components/setup-guide-content';
import { StitchPageShell } from '../components/ui/stitch-page-shell';
import { StitchSectionTitle } from '../components/ui/stitch-section-title';

export function SetupGuidePage() {
  return (
    <StitchPageShell>
      <div className="max-w-[800px] mx-auto px-4 py-8">
        <StitchSectionTitle
          eyebrow="Full Setup Guide"
          title="From Zero to Live Trading"
        >
          Step-by-step: from zero to live trading with CashClaw.
        </StitchSectionTitle>
        <SetupGuideContent />
      </div>
    </StitchPageShell>
  );
}
