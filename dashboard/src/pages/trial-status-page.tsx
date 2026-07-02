/**
 * Trial Status Page
 *
 * Displays trial progress, remaining days, email subscription toggle,
 * and a drip schedule timeline.
 *
 * Endpoints:
 *   GET  /api/v1/trial-drip/status
 *   POST /api/v1/trial-drip/subscribe
 *
 * Protected route: /app/trial
 */
import { useState, useEffect, useCallback } from 'react';
import { useApiClient } from '../hooks/use-api-client';

/* ─── Types ──────────────────────────────────────── */

interface TrialStatus {
  daysRemaining: number;
  totalDays: number;
  startDate: string;
  endDate: string;
  subscribed: boolean;
  tier: string;
  email: string;
}

interface DripEvent {
  day: number;
  title: string;
  description: string;
  type: 'email' | 'feature' | 'milestone';
}

/* ─── Drip schedule (static timeline) ────────────── */

const DRIP_SCHEDULE: DripEvent[] = [
  { day: 1,  title: 'Welcome',                            description: 'Getting started guide and platform overview',     type: 'email' },
  { day: 2,  title: 'First Strategy',                      description: 'How to browse and subscribe to a strategy',       type: 'feature' },
  { day: 3,  title: 'Marketplace Tour',                    description: 'Detailed walkthrough of the marketplace',         type: 'email' },
  { day: 5,  title: 'Performance Metrics',                 description: 'Understanding your dashboard metrics',            type: 'milestone' },
  { day: 7,  title: 'Polymarket Integration',              description: 'Connecting your Polymarket account',              type: 'feature' },
  { day: 10, title: 'Risk Management',                     description: 'Setting up risk limits and alerts',               type: 'email' },
  { day: 14, title: 'Backtesting Deep Dive',               description: 'Using the backtesting engine effectively',       type: 'milestone' },
  { day: 18, title: 'Advanced Settings',                   description: 'MM parameters, exchange keys, alert rules',      type: 'feature' },
  { day: 21, title: 'Halfway Check-in',                    description: 'Tips to optimise your strategy performance',     type: 'email' },
  { day: 25, title: 'API Access',                          description: 'Using the API for programmatic access',           type: 'feature' },
  { day: 28, title: 'Final Week Prep',                     description: 'Preparing for post-trial decisions',             type: 'email' },
  { day: 30, title: 'Trial Ends',                          description: 'Choose a plan to continue uninterrupted trading', type: 'milestone' },
];

/* ─── Default state (fallback when API unavailable) ─ */

const DEFAULT_STATUS: TrialStatus = {
  daysRemaining: 14,
  totalDays: 30,
  startDate: new Date(Date.now() - 16 * 86400000).toISOString(),
  endDate: new Date(Date.now() + 14 * 86400000).toISOString(),
  subscribed: true,
  tier: 'free',
  email: '',
};

/* ─── Sub-components ──────────────────────────────── */

function ProgressBar({ current, max }: { current: number; max: number }) {
  const pct = Math.max(0, Math.min(100, ((max - current) / max) * 100));
  return (
    <div className="w-full bg-bg-border rounded-full h-2.5 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{
          width: `${pct}%`,
          background: pct > 66 ? 'linear-gradient(90deg, #00E676, #F59E0B)' :
                     pct > 33 ? 'linear-gradient(90deg, #FFB800, #F59E0B)' :
                     'linear-gradient(90deg, #FF4466, #FFB800)',
        }}
      />
    </div>
  );
}

function Timeline({ currentDay, subscribed }: { currentDay: number; subscribed: boolean }) {
  const visible = DRIP_SCHEDULE.filter((e) => e.day <= Math.max(currentDay + 14, 30));

  return (
    <div className="space-y-0">
      {visible.map((event, idx) => {
        const isPast = event.day < currentDay;
        const isToday = event.day === currentDay;
        const isFuture = event.day > currentDay;

        return (
          <div key={event.day} className="relative flex gap-4 pb-5 last:pb-0">
            {/* Vertical connector */}
            {idx < visible.length - 1 && (
              <div
                className={`absolute left-[11px] top-5 w-0.5 h-full ${
                  isPast ? 'bg-accent/30' : 'bg-bg-border'
                }`}
              />
            )}

            {/* Dot */}
            <div className="flex-shrink-0 relative z-10 mt-0.5">
              {isToday ? (
                <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-accent/20 border-2 border-accent">
                  <span className="h-2 w-2 rounded-full bg-accent animate-pulse-soft" />
                </span>
              ) : isPast ? (
                <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-profit/20 border border-profit/40">
                  <svg width="10" height="10" fill="none" stroke="#00E676" strokeWidth="2.5" viewBox="0 0 24 24">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              ) : (
                <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-bg-surface border border-bg-border">
                  <span className="h-2 w-2 rounded-full bg-muted/40" />
                </span>
              )}
            </div>

            {/* Content */}
            <div className={`flex-1 min-w-0 ${isFuture ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-xs font-semibold ${
                  isToday ? 'text-accent' : isPast ? 'text-white' : 'text-muted'
                }`}>
                  Day {event.day}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  event.type === 'email' ? 'bg-accent/10 text-accent border border-accent/20' :
                  event.type === 'feature' ? 'bg-profit/10 text-profit border border-profit/20' :
                  'bg-gold/10 text-gold border border-gold/20'
                }`}>
                  {event.type}
                </span>
                {isToday && (
                  <span className="text-[10px] text-accent font-bold animate-pulse-soft">NOW</span>
                )}
              </div>
              <p className="text-white text-xs">{event.title}</p>
              <p className="text-muted text-[10px] mt-0.5 leading-relaxed">{event.description}</p>
            </div>

            {/* Email icon for email-type events when subscribed */}
            {event.type === 'email' && subscribed && isPast && (
              <span className="flex-shrink-0 text-profit/60" title="Email sent">
                <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
                </svg>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Page ────────────────────────────────────────── */

export function TrialStatusPage() {
  const { fetchApi } = useApiClient();

  const [status, setStatus] = useState<TrialStatus>(DEFAULT_STATUS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const currentDay = status.totalDays - status.daysRemaining;

  /* Fetch trial status */
  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi<TrialStatus>('/v1/trial-drip/status');
      if (data) {
        setStatus(data);
      } else {
        // Use default when API unavailable
        setStatus(DEFAULT_STATUS);
      }
    } catch {
      setStatus(DEFAULT_STATUS);
    } finally {
      setLoading(false);
    }
  }, [fetchApi]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  /* Toggle email subscription */
  async function handleToggleSubscribe() {
    setSaving(true);
    setError(null);
    try {
      const newState = !status.subscribed;
      const result = await fetchApi<TrialStatus>('/v1/trial-drip/subscribe', {
        method: 'POST',
        body: JSON.stringify({ subscribed: newState }),
      });
      if (result) {
        setStatus(result);
      } else {
        // Optimistic update if API doesn't return full status
        setStatus((prev) => ({ ...prev, subscribed: newState }));
      }
    } catch {
      setError('Failed to update subscription preference.');
    } finally {
      setSaving(false);
    }
  }

  /* ── Render ───────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin h-8 w-8 text-muted" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-muted text-xs">Loading trial status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-white text-2xl font-bold">Trial Status</h1>

      {/* Error banner */}
      {error && (
        <div className="bg-loss/10 border border-loss/30 rounded-lg p-3 flex items-center justify-between">
          <span className="text-loss text-xs">{error}</span>
          <button onClick={() => setError(null)} className="text-loss/60 text-xs hover:text-loss ml-3">&times;</button>
        </div>
      )}

      {/* Trial progress card */}
      <section className="bg-bg-surface border border-bg-border rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white text-sm font-bold">Trial Progress</h2>
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
            status.daysRemaining > 20 ? 'bg-profit/10 text-profit' :
            status.daysRemaining > 10 ? 'bg-gold/10 text-gold' :
            'bg-loss/10 text-loss'
          }`}>
            {status.daysRemaining} days left
          </span>
        </div>

        <div className="space-y-2">
          <ProgressBar current={status.daysRemaining} max={status.totalDays} />
          <div className="flex justify-between text-[10px] text-muted">
            <span>Started {new Date(status.startDate).toLocaleDateString()}</span>
            <span>{status.totalDays} day trial</span>
            <span>Ends {new Date(status.endDate).toLocaleDateString()}</span>
          </div>
        </div>

        <div className="bg-bg border border-bg-border rounded p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white text-xs font-semibold">Current Plan: {status.tier.toUpperCase()}</p>
              <p className="text-muted text-[10px] mt-0.5">
                Day {currentDay} of {status.totalDays}
              </p>
            </div>
            {status.daysRemaining <= 7 && (
              <a
                href="/pricing"
                className="bg-accent text-bg text-xs font-bold px-3 py-1.5 rounded hover:bg-accent/80 transition-colors"
              >
                Upgrade Now
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Email preference toggle */}
      <section className="bg-bg-surface border border-bg-border rounded-lg p-6 space-y-4">
        <h2 className="text-white text-sm font-bold">Email Preferences</h2>
        <p className="text-muted text-xs">
          Receive drip emails with tips, strategy highlights, and product updates during your trial.
        </p>

        <div className="flex items-center justify-between bg-bg border border-bg-border rounded px-4 py-3">
          <div>
            <p className="text-white text-xs font-semibold">
              {status.subscribed ? 'Subscribed' : 'Unsubscribed'}
            </p>
            <p className="text-muted text-[10px] mt-0.5">
              {status.subscribed
                ? 'You will receive educational drip emails during the trial.'
                : 'You will not receive any drip emails.'}
            </p>
          </div>
          <button
            onClick={handleToggleSubscribe}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
              status.subscribed ? 'bg-accent' : 'bg-bg-border'
            }`}
            role="switch"
            aria-checked={status.subscribed}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                status.subscribed ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {saving && (
          <p className="text-muted text-[10px] flex items-center gap-1">
            <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Saving...
          </p>
        )}
      </section>

      {/* Drip schedule timeline */}
      <section className="bg-bg-surface border border-bg-border rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white text-sm font-bold">Drip Schedule</h2>
          <span className="text-muted text-[10px]">
            {status.subscribed ? 'Emails on' : 'Emails off'}
          </span>
        </div>
        <p className="text-muted text-xs">
          Timeline of emails, feature unlocks, and milestones during your {status.totalDays}-day trial.
        </p>
        <Timeline currentDay={currentDay} subscribed={status.subscribed} />
      </section>

      {/* Info note */}
      <p className="text-muted text-[10px] text-center">
        Trial status and drip preferences are managed server-side via the trial-drip API.
      </p>
    </div>
  );
}

export default TrialStatusPage;
