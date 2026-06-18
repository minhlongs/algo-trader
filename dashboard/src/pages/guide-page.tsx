/**
 * App guide page at /app/guide — inside LayoutShell sidebar.
 * Renders GuideContent directly; sidebar provided by LayoutShell.
 * Stitch-aligned UI using shared components.
 */
import { GuideContent } from '../components/guide-content';
import { StitchPageShell } from '../components/ui/stitch-page-shell';
import { StitchSectionTitle } from '../components/ui/stitch-section-title';

export function GuidePage() {
  return (
    <StitchPageShell>
      <div className="max-w-[800px] mx-auto px-4 py-8">
        <StitchSectionTitle
          eyebrow="Operator Guide"
          title="CashClaw SOPs"
        >
          Everything you need to run the market-making bot profitably.
        </StitchSectionTitle>
        <GuideContent />
      </div>
    </StitchPageShell>
  );
}
