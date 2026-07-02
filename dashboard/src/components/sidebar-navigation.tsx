/**
 * Sidebar navigation for CashClaw app routes (/app/*).
 * Phosphor icons. Active state via React Router useLocation.
 */
import { useLocation, Link } from 'react-router-dom';
import {
  SquaresFour,
  Lightning,
  ChartLine,
  Key,
  Ticket,
  FileText,
  Gear,
  User,
  BookOpen,
  Wrench,
  ShareNetwork,
  SignOut,
  ChartBar,
  Lock,
  Clock,
} from '@phosphor-icons/react';
import { useTradingStore } from '../stores/trading-store';
import { useAuthStore } from '../stores/auth-store';

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/app', Icon: SquaresFour },
  { label: 'Strategies', path: '/app/strategies', Icon: Lightning },
  { label: 'Backtests', path: '/app/backtests', Icon: ChartLine },
  { label: 'Licenses', path: '/app/licenses', Icon: Key },
  { label: 'API Keys', path: '/app/api-keys', Icon: Lock },
  { label: 'Trial', path: '/app/trial', Icon: Clock },
  { label: 'Coupons', path: '/app/coupons', adminOnly: true, Icon: Ticket },
  { label: 'Reporting', path: '/app/reporting', Icon: FileText },
  { label: 'Performance', path: '/app/strategy-performance', Icon: ChartBar },
  { label: 'Settings', path: '/app/settings', Icon: Gear },
  { label: 'Account', path: '/app/account', Icon: User },
  { label: 'Referral', path: '/app/referral', Icon: ShareNetwork },
  { label: 'Guide', path: '/app/guide', Icon: BookOpen },
  { label: 'Full Setup', path: '/app/setup', Icon: Wrench },
];

interface SidebarNavigationProps {
  onNavigate?: () => void;
}

export function SidebarNavigation({ onNavigate }: SidebarNavigationProps) {
  const { pathname } = useLocation();
  const connected = useTradingStore((s) => (s as any).connected as boolean);
  const { email, tier, role, logout } = useAuthStore();

  const tierBadge: Record<string, string> = {
    free: 'text-muted bg-bg-border/50',
    pro: 'text-accent bg-accent/10',
    enterprise: 'text-gold bg-gold/10',
  };
  const badgeClass = tierBadge[tier as string] ?? tierBadge['free'];

  const isActive = (path: string) =>
    path === '/app' ? pathname === '/app' : pathname.startsWith(path);

  return (
    <nav className="flex flex-col h-full">
      <ul className="flex-1 py-2">
        {NAV_ITEMS.filter((item) => !item.adminOnly || role === 'admin').map(({ label, path, Icon }) => {
          const active = isActive(path);
          return (
            <li key={path}>
              <Link
                to={path}
                onClick={onNavigate}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors min-h-touch ${
                  active
                    ? 'text-accent bg-accent/10 border-l-[3px] border-accent font-medium'
                    : 'text-muted hover:text-white border-l-[3px] border-transparent'
                }`}
              >
                <Icon weight={active ? 'fill' : 'regular'} className="w-[18px] h-[18px] flex-shrink-0" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* User info + logout */}
      <div className="px-4 pb-3 border-t border-bg-border pt-3 space-y-2">
        {email && (
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-muted text-xs truncate flex-1">{email}</p>
            <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase ${badgeClass}`}>
              {tier}
            </span>
          </div>
        )}
        <button
          onClick={logout}
          className="w-full text-left text-xs text-muted hover:text-loss transition-colors py-1 flex items-center gap-1.5 min-h-touch"
        >
          <SignOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>

      {/* Connection status */}
      <div className="px-4 py-3 border-t border-bg-border">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
            connected ? 'bg-profit shadow-[0_0_6px_rgba(0,230,118,0.4)]' : 'bg-loss'
          }`} />
          <span className="text-xs text-muted">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>
    </nav>
  );
}
