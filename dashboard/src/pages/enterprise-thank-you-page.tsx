/**
 * Enterprise Thank-You Page
 * Shown after a successful enterprise inquiry submission.
 * Displays paper-demo credentials if provisioned (passed via query param inquiry=ID).
 */

import { useSearchParams, Link } from 'react-router-dom';
import { PublicNavbar } from '../components/public-navbar';
import { Footer } from '../components/footer';

export function EnterpriseThankYouPage() {
  const [searchParams] = useSearchParams();
  const inquiryId = searchParams.get('inquiry') ?? '';

  return (
    <div className="min-h-screen bg-bg text-white flex flex-col">
      <PublicNavbar />

      <main className="flex-1 pt-24 pb-16 px-4 sm:px-6 max-w-xl mx-auto w-full">
        {/* Success header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-profit/10 border border-profit/30 mb-6">
            <svg width="28" height="28" fill="none" stroke="#34D399" strokeWidth="2" viewBox="0 0 24 24">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Inquiry received</h1>
          <p className="text-muted text-sm max-w-sm mx-auto">
            Our team will reach out within 24 hours to schedule a walkthrough and discuss contract terms.
          </p>
        </div>

        {/* What happens next */}
        <div className="border border-bg-border bg-bg-surface/80 backdrop-blur-sm rounded-lg p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1 h-4 bg-accent rounded-full" />
            <h2 className="text-accent text-xs font-mono font-bold uppercase tracking-widest">What happens next</h2>
          </div>
          <ol className="space-y-4">
            {NEXT_STEPS.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-profit/15 border border-profit/40 text-profit text-xs flex items-center justify-center font-bold">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm text-white font-semibold mb-0.5">{step.title}</p>
                  <p className="text-xs text-muted">{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Paper demo notice */}
        <div className="border border-accent/20 bg-accent/5 rounded-lg p-5 mb-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1 h-4 bg-accent rounded-full" />
            <p className="text-xs text-accent uppercase tracking-widest font-mono font-bold">Paper-trading demo</p>
          </div>
          <p className="text-sm text-muted">
            A 30-day paper-trading demo environment has been provisioned for your team.
            Check your inbox for credentials — no payment or setup required.
          </p>
        </div>

        {/* Reference ID */}
        {inquiryId && (
          <p className="text-center text-xs text-muted/50 mb-8">
            Reference: <span className="text-muted">{inquiryId}</span>
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/docs"
            className="text-center text-sm border border-bg-border text-muted px-5 py-2.5 rounded hover:text-white hover:border-accent/40 transition-colors"
          >
            Read the docs
          </Link>
          <Link
            to="/"
            className="text-center text-sm bg-accent text-bg font-bold px-5 py-2.5 rounded hover:bg-accent/80 transition-colors"
          >
            Back to home
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}

const NEXT_STEPS = [
  {
    title: 'TAM assignment (today)',
    desc: 'A Technical Account Manager is notified and will claim your inquiry.',
  },
  {
    title: 'Intro call (within 24 h)',
    desc: 'Your TAM schedules a 30-minute discovery call to understand your requirements.',
  },
  {
    title: 'Custom proposal',
    desc: 'We send a tailored contract and invoice — no card required.',
  },
  {
    title: 'Onboarding',
    desc: 'Dedicated onboarding session, API setup, and strategy configuration.',
  },
];
