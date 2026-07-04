/**
 * Strategies page: MM strategy catalogue.
 * Active: Market Making. Coming soon: Listing Arb, Cross-Platform Arb.
 * Refactored to use Stitch design system.
 */
import { Link } from 'react-router-dom';
import { StitchBadge, StitchCard, StitchButton } from '../components/ui/stitch-components';
import { COLORS } from '../lib/stitch-design-tokens';

interface Strategy {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'coming-soon';
  tag: string;
  stats?: { label: string; value: string }[];
}

const STRATEGIES: Strategy[] = [
  {
    id: 'mm',
    name: 'Market Making',
    description:
      'Posts bid/ask orders around the fair-value mid-price on Polymarket prediction markets. Earns the spread on every matched fill. Safety limits cap daily loss and inventory exposure.',
    status: 'active',
    tag: 'Live',
    stats: [
      { label: 'Avg spread earned', value: '0.08–0.12' },
      { label: 'Requote latency', value: '< 2s' },
      { label: 'Safety heartbeat', value: '5s' },
    ],
  },
  {
    id: 'listing-arb',
    name: 'Listing Arbitrage',
    description:
      'Detects newly listed Polymarket markets before liquidity concentrates. Places early orders at favourable prices before the crowd narrows the spread.',
    status: 'coming-soon',
    tag: 'Soon',
  },
  {
    id: 'cross-platform-arb',
    name: 'Cross-Platform Arbitrage',
    description:
      'Identifies price discrepancies for the same event across Polymarket and other prediction market venues. Buys low on one side, hedges on the other.',
    status: 'coming-soon',
    tag: 'Soon',
  },
];

function StatusBadge({ status }: { status: Strategy['status'] }) {
  if (status === 'active') {
    return (
      <StitchBadge label="Live" tone="profit" />
    );
  }
  return (
    <StitchBadge label="Coming Soon" tone="neutral" />
  );
}

export function MarketplacePage() {
  return (
    <div className="space-y-6" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: COLORS.onSurface }}>Strategies</h1>
        <p className="text-xs mt-1" style={{ color: COLORS.onSurfaceVariant }}>
          Automated market making and arbitrage strategies for Polymarket.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {STRATEGIES.map((s) => (
          <StitchCard key={s.id} className="p-5 flex flex-col gap-4" onClick={() => {}}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold leading-snug" style={{ color: COLORS.onSurface }}>{s.name}</h2>
              <StatusBadge status={s.status} />
            </div>

            <p className="text-xs leading-relaxed flex-1" style={{ color: COLORS.onSurfaceVariant }}>{s.description}</p>

            {s.stats && (
              <div className="grid grid-cols-1 gap-1.5 border-t pt-3" style={{ borderColor: COLORS.outline }}>
                {s.stats.map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between text-xs">
                    <span style={{ color: COLORS.onSurfaceVariant }}>{label}</span>
                    <span className="font-mono" style={{ color: COLORS.primary }}>{value}</span>
                  </div>
                ))}
              </div>
            )}

            {s.status === 'active' ? (
              <Link to="/app/settings">
                <StitchButton variant="primary" className="w-full text-center">Configure</StitchButton>
              </Link>
            ) : (
              <div className="text-center text-xs font-bold border rounded py-2" style={{ borderColor: COLORS.outline, color: COLORS.onSurfaceVariant }}>
                Not available yet
              </div>
            )}
          </StitchCard>
        ))}
      </div>
    </div>
  );
}

export default MarketplacePage;
