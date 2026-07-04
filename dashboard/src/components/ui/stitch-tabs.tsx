import { COLORS } from '../../lib/stitch-design-tokens';

interface StitchTabsProps {
  active: string;
  tabs: string[];
  onChange: (tab: string) => void;
}

export function StitchTabs({ active, tabs, onChange }: StitchTabsProps) {
  return (
    <div className="inline-flex rounded-lg border p-1 gap-1" style={{ backgroundColor: `${COLORS.bg}55`, borderColor: COLORS.outline }}>
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className="px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors"
          style={{
            backgroundColor: active === tab ? `${COLORS.primary}33` : 'transparent',
            color: active === tab ? COLORS.primary : COLORS.onSurfaceVariant,
          }}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
