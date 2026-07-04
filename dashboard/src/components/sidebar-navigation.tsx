/**
 * Sidebar navigation for CashClaw app routes (/app/*).
 * Phosphor icons. Active state via React Router useLocation.
 */
import { useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  Trophy,
} from '@phosphor-icons/react';
import { useTradingStore } from '../stores/trading-store';
import { useAuthStore } from '../stores/auth-store';
import { ThemeToggle } from './theme-toggle';
import { LanguageSwitcher } from './language-switcher';

const NAV_ITEMS = [
  { label: 'Dashboard', tKey: 'sidebar.dashboard', path: '/app', Icon: SquaresFour },
  { label: 'Strategies', tKey: 'sidebar.strategies', path: '/app/strategies', Icon: Lightning },
  { label: 'Leaderboard', tKey: 'sidebar.leaderboard', path: '/app/leaderboard', Icon: Trophy },
  { label: 'Backtests', tKey: 'sidebar.backtests', path: '/app/backtests', Icon: ChartLine },
  { label: 'Licenses', tKey: 'sidebar.licenses', path: '/app/licenses', Icon: Key },
  { label: 'API Keys', tKey: 'sidebar.apiKeys', path: '/app/api-keys', Icon: Lock },
  { label: 'Trial', tKey: 'sidebar.trial', path: '/app/trial', Icon: Clock },
  { label: 'Coupons', tKey: 'sidebar.coupons', path: '/app/coupons', adminOnly: true, Icon: Ticket },
  { label: 'Reporting', tKey: 'sidebar.reporting', path: '/app/reporting', Icon: FileText },
  { label: 'Performance', tKey: 'sidebar.performance', path: '/app/strategy-performance', Icon: ChartBar },
  { label: 'Settings', tKey: 'sidebar.settings', path: '/app/settings', Icon: Gear },
  { label: 'Account', tKey: 'sidebar.account', path: '/app/account', Icon: User },
  { label: 'Referral', tKey: 'sidebar.referral', path: '/app/referral', Icon: ShareNetwork },
  { label: 'Guide', tKey: 'sidebar.guide', path: '/app/guide', Icon: BookOpen },
  { label: 'Full Setup', tKey: 'sidebar.fullSetup', path: '/app/setup', Icon: Wrench },
];

interface SidebarNavigationProps {
  onNavigate?: () => void;
}

export function SidebarNavigation({ onNavigate }: SidebarNavigationProps) {
  const { pathname } = useLocation();
  const { t } = useTranslation();
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
        {NAV_ITEMS.filter((item) => !item.adminOnly || role === 'admin').map(({ tKey, path, Icon }) => {
          const active = isActive(path);
          return (
            <li key={path}>
              <Link
                to={path}
                onClick={onNavigate}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors min-h-touch focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface rounded-r ${
                  active
                    ? 'text-accent bg-accent/10 border-l-[3px] border-accent font-medium'
                    : 'text-muted hover:text-white border-l-[3px] border-transparent'
                }`}
              >
                <Icon weight={active ? 'fill' : 'regular'} className="w-[18px] h-[18px] flex-shrink-0" />
                {t(tKey)}
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
          {t('sidebar.signOut')}
        </button>
      </div>

      {/* Connection status + theme toggle + language switcher */}
      <div className="px-4 py-3 border-t border-bg-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
            connected ? 'bg-profit shadow-[0_0_6px_rgba(0,230,118,0.4)]' : 'bg-loss'
          }`} />
          <span className="text-xs text-muted">
            {t(connected ? 'sidebar.connected' : 'sidebar.disconnected')}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
