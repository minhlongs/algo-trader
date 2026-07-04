/**
 * Enterprise Contact Page
 * Contact form for $49k/$199k/$499k invoice-based enterprise plans.
 * Submits to POST /api/enterprise/inquiries — no self-serve checkout.
 */

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PublicNavbar } from '../components/public-navbar';
import { Footer } from '../components/footer';
import { ENTERPRISE_PLANS, type EnterprisePlanKey } from '../lib/enterprise-plans';

type FormState = 'idle' | 'submitting' | 'error';

interface FormFields {
  email: string;
  companyName: string;
  contactName: string;
  tier: EnterprisePlanKey;
  useCase: string;
  teamSize: string;
}

const TEAM_SIZE_OPTIONS = ['1-10', '11-50', '51-200', '201-500', '500+'];

export function EnterpriseContactPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultTier = (searchParams.get('tier') as EnterprisePlanKey) ?? 'growth';

  const [fields, setFields] = useState<FormFields>({
    email: '',
    companyName: '',
    contactName: '',
    tier: defaultTier,
    useCase: '',
    teamSize: '',
  });
  const [formState, setFormState] = useState<FormState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  function set(key: keyof FormFields, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormState('submitting');
    setErrorMsg('');

    try {
      const res = await fetch('/api/enterprise/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: fields.email.trim(),
          companyName: fields.companyName.trim(),
          contactName: fields.contactName.trim(),
          tier: fields.tier,
          useCase: fields.useCase.trim(),
          teamSize: fields.teamSize || undefined,
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }

      const data = (await res.json()) as { inquiryId: string };
      navigate(`/enterprise/thank-you?inquiry=${data.inquiryId}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setFormState('error');
    }
  }

  const isSubmitting = formState === 'submitting';

  return (
    <div className="min-h-screen bg-[#080B14] text-white flex flex-col">
      <PublicNavbar />

      <main className="flex-1 pt-24 pb-16 px-4 sm:px-6 max-w-xl mx-auto w-full">
        <div className="mb-10">
          <p className="text-[#00C8E8] text-xs uppercase tracking-widest mb-3">Enterprise</p>
          <h1 className="text-3xl font-bold text-white mb-3">Talk to our team</h1>
          <p className="text-[#8892B0] text-sm">
            Enterprise plans are invoice-based with dedicated onboarding. Fill in the form and we will
            reach out within 24 hours.
          </p>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-5">
          {/* Tier selector */}
          <div>
            <label className="block text-xs text-[#8892B0] mb-1.5">Plan interest</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(ENTERPRISE_PLANS) as [EnterprisePlanKey, (typeof ENTERPRISE_PLANS)[EnterprisePlanKey]][]).map(([key, plan]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => set('tier', key)}
                  className={`p-3 rounded border text-xs text-left transition-colors ${
                    fields.tier === key
                      ? 'border-[#00C8E8] bg-[#00C8E8]/10 text-white'
                      : 'border-[#1E2640] text-[#8892B0] hover:border-[#00C8E8]/40'
                  }`}
                >
                  <p className="font-bold text-sm mb-0.5">{plan.price}</p>
                  <p className="text-[10px] opacity-70">{plan.name}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Contact fields */}
          <Field label="Work email *" htmlFor="email">
            <input
              id="email" type="email" required value={fields.email}
              onChange={(e) => set('email', e.target.value)}
              className={inputCls}
              placeholder="you@company.com"
            />
          </Field>

          <Field label="Contact name *" htmlFor="contactName">
            <input
              id="contactName" type="text" required value={fields.contactName}
              onChange={(e) => set('contactName', e.target.value)}
              className={inputCls}
              placeholder="Your full name"
            />
          </Field>

          <Field label="Company name *" htmlFor="companyName">
            <input
              id="companyName" type="text" required value={fields.companyName}
              onChange={(e) => set('companyName', e.target.value)}
              className={inputCls}
              placeholder="Acme Capital"
            />
          </Field>

          <Field label="Team size" htmlFor="teamSize">
            <select
              id="teamSize" value={fields.teamSize}
              onChange={(e) => set('teamSize', e.target.value)}
              className={inputCls}
            >
              <option value="">Select…</option>
              {TEAM_SIZE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>

          <Field label="How will you use CashClaw? *" htmlFor="useCase">
            <textarea
              id="useCase" required minLength={20} value={fields.useCase}
              onChange={(e) => set('useCase', e.target.value)}
              rows={4}
              className={`${inputCls} resize-none`}
              placeholder="Describe your workflow, volume expectations, and key requirements…"
            />
          </Field>

          {formState === 'error' && (
            <p className="text-red-400 text-xs border border-red-400/30 bg-red-400/10 rounded px-3 py-2">
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-[#00C8E8] text-[#080B14] font-bold py-3 rounded hover:bg-[#00C8E8]/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Sending…' : 'Request enterprise access'}
          </button>

          <p className="text-[#555] text-xs text-center">
            No payment required. Invoice-based close only.
          </p>
        </form>
      </main>

      <Footer />
    </div>
  );
}

const inputCls =
  'w-full bg-[#161A1E] border border-[#1E2640] text-white text-sm rounded px-3 py-2.5 outline-none focus:border-[#00C8E8]/60 transition-colors placeholder-[#555]';

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs text-[#8892B0] mb-1.5">{label}</label>
      {children}
    </div>
  );
}
