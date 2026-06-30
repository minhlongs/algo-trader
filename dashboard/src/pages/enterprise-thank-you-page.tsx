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
    <div className="min-h-screen bg-[#080B14] text-white font-mono flex flex-col">
      <PublicNavbar />

      <main className="flex-1 pt-24 pb-16 px-4 sm:px-6 max-w-xl mx-auto w-full">
        {/* Success header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#00D4AA]/10 border border-[#00D4AA]/30 mb-6">
            <svg width="28" height="28" fill="none" stroke="#00D4AA" strokeWidth="2" viewBox="0 0 24 24">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Inquiry received</h1>
          <p className="text-[#8892B0] text-sm max-w-sm mx-auto">
            Our team will reach out within 24 hours to schedule a walkthrough and discuss contract terms.
          </p>
        </div>

        {/* What happens next */}
        <div className="border border-[#1E2640] bg-[#111627] rounded-lg p-6 mb-6">
          <h2 className="text-sm font-bold text-white mb-4">What happens next</h2>
          <ol className="space-y-4">
            {NEXT_STEPS.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#00D4AA]/15 border border-[#00D4AA]/40 text-[#00D4AA] text-xs flex items-center justify-center font-bold">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm text-white font-semibold mb-0.5">{step.title}</p>
                  <p className="text-xs text-[#8892B0]">{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Paper demo notice */}
        <div className="border border-[#00C8E8]/20 bg-[#00C8E8]/5 rounded-lg p-5 mb-8">
          <p className="text-xs text-[#00C8E8] uppercase tracking-widest mb-2">Paper-trading demo</p>
          <p className="text-sm text-[#8892B0]">
            A 30-day paper-trading demo environment has been provisioned for your team.
            Check your inbox for credentials — no payment or setup required.
          </p>
        </div>

        {/* Reference ID */}
        {inquiryId && (
          <p className="text-center text-xs text-[#555] mb-8">
            Reference: <span className="font-mono text-[#8892B0]">{inquiryId}</span>
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/docs"
            className="text-center text-sm border border-[#1E2640] text-[#8892B0] px-5 py-2.5 rounded hover:text-white hover:border-[#00C8E8]/40 transition-colors"
          >
            Read the docs
          </Link>
          <Link
            to="/"
            className="text-center text-sm bg-[#00C8E8] text-[#080B14] font-bold px-5 py-2.5 rounded hover:bg-[#00C8E8]/80 transition-colors"
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
