/**
 * App guide page at /app/guide — inside LayoutShell sidebar.
 * Renders GuideContent directly; sidebar provided by LayoutShell.
 */
import { GuideContent } from '../components/guide-content';

export function GuidePage() {
  return (
    <div className="max-w-[800px] mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-1 h-5 bg-accent rounded-full" />
          <h1 className="text-2xl font-bold text-white">Operator Guide</h1>
        </div>
        <p className="text-sm text-muted">
          CashClaw SOPs — everything you need to run the market-making bot profitably.
        </p>
      </div>
      <GuideContent />
    </div>
  );
}
